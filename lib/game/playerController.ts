// On-foot character controller.
// Framework-free math operating on the shared GameWorld so the same logic
// can later run on a multiplayer server. Called every frame from Player.tsx.

import {
  GRAVITY,
  PLAYER_ACCEL,
  PLAYER_TURN_SPEED,
  RUN_SPEED,
  WALK_SPEED,
} from "./gameConstants";
import { BUILDING_DOORS } from "./map/village";
import { carryDelta, coachFloorAt, collideTrain, platformTopAt } from "./map/railway";
import { groundHeight, WORLD_HALF } from "./map/terrain";
import {
  ROOM_HALF_X,
  ROOM_HALF_Z,
  WALL_T,
} from "./map/interior";
import { INTERACT_DISTANCE } from "./gameConstants";
import type { GameWorld } from "./state";

function damp(current: number, target: number, rate: number, dt: number) {
  const t = 1 - Math.exp(-rate * dt);
  return current + (target - current) * t;
}

function lerpAngle(current: number, target: number, rate: number, dt: number) {
  let delta = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  const t = 1 - Math.exp(-rate * dt);
  return current + delta * t;
}

function collideBox(
  x: number,
  z: number,
  radius: number,
  bx: number,
  bz: number,
  halfX: number,
  halfZ: number,
): { x: number; z: number } {
  const dx = x - bx;
  const dz = z - bz;
  const px = halfX + radius - Math.abs(dx);
  const pz = halfZ + radius - Math.abs(dz);
  if (px > 0 && pz > 0) {
    if (px < pz) return { x: bx + Math.sign(dx || 1) * (halfX + radius), z };
    return { x, z: bz + Math.sign(dz || 1) * (halfZ + radius) };
  }
  return { x, z };
}

/** World collision: plain land has no buildings, so no colliders. */
export function collideWorld(
  x: number,
  z: number,
  _radius: number,
): { x: number; z: number } {
  return { x, z };
}

/** Keep the player inside the interior room (local coords centered at origin). */
export function clampToRoom(
  x: number,
  z: number,
  radius: number,
): { x: number; z: number } {
  const lx = ROOM_HALF_X - WALL_T - radius;
  const lz = ROOM_HALF_Z - WALL_T - radius;
  return {
    x: Math.min(lx, Math.max(-lx, x)),
    z: Math.min(lz, Math.max(-lz, z)),
  };
}

/**
 * Index of the nearest enterable door within INTERACT_DISTANCE, or null.
 * Outdoors only — used by GameRig to drive the "Press E to enter" prompt.
 */
export function nearestDoor(world: GameWorld): number | null {
  if (world.mode !== "walk" || world.interior !== null) return null;
  let best: number | null = null;
  let bestD = INTERACT_DISTANCE;
  for (let i = 0; i < BUILDING_DOORS.length; i++) {
    const d = BUILDING_DOORS[i];
    const dist = Math.hypot(world.playerPos.x - d.x, world.playerPos.z - d.z);
    if (dist < bestD) {
      bestD = dist;
      best = i;
    }
  }
  return best;
}

export function updateOnFoot(world: GameWorld, dt: number) {
  const { keys } = world;
  const step = Math.min(dt, 1 / 20);

  // Camera-relative input direction.
  const fwdX = Math.sin(world.camYaw);
  const fwdZ = Math.cos(world.camYaw);
  const rightX = -Math.cos(world.camYaw);
  const rightZ = Math.sin(world.camYaw);
  const inZ = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
  const inX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);

  let dirX = fwdX * inZ + rightX * inX;
  let dirZ = fwdZ * inZ + rightZ * inX;
  const len = Math.hypot(dirX, dirZ);
  const moving = len > 0.01;
  if (moving) {
    dirX /= len;
    dirZ /= len;
  }

  const inside = world.interior !== null;

  const running = keys.run && inZ > 0;
  const targetSpeed = moving ? (running ? RUN_SPEED : WALK_SPEED) : 0;
  world.playerSpeed = damp(world.playerSpeed, targetSpeed, PLAYER_ACCEL, step);
  world.playerMoving = world.playerSpeed > 0.25;
  world.playerRunning = running && world.playerMoving;

  if (world.playerSpeed > 0.01 && moving) {
    const targetYaw = Math.atan2(dirX, dirZ);
    world.playerYaw = lerpAngle(world.playerYaw, targetYaw, PLAYER_TURN_SPEED, step);
  }

  // Move along the (normalized) input direction for consistent diagonal speed.
  world.playerPos.x += dirX * world.playerSpeed * step;
  world.playerPos.z += dirZ * world.playerSpeed * step;

  if (inside) {
    // Interior: flat floor at y=0, clamp to the room walls.
    world.playerPos.y = 0;
    world.playerVelY = 0;
    const room = clampToRoom(world.playerPos.x, world.playerPos.z, 0.5);
    world.playerPos.x = room.x;
    world.playerPos.z = room.z;
  } else {
    // Ride along when standing inside a moving coach (applied before input
    // so WASD stays relative to the car).
    const carry = carryDelta(world.playerPos.x, world.playerPos.z);
    world.playerPos.x += carry.dx;
    world.playerPos.z += carry.dz;

    // Shoreline: the island ends at the map edge.
    const B = WORLD_HALF;
    world.playerPos.x = Math.min(B, Math.max(-B, world.playerPos.x));
    world.playerPos.z = Math.min(B, Math.max(-B, world.playerPos.z));

    // Ground: terrain, station platform tops, coach floors (incl. doorway
    // bridge plates). Elevated surfaces only catch players above them.
    let gy = groundHeight(world.playerPos.x, world.playerPos.z);
    const pf = platformTopAt(world.playerPos.x, world.playerPos.z, world.playerPos.y);
    if (pf !== null) gy = Math.max(gy, pf);
    const cf = coachFloorAt(world.playerPos.x, world.playerPos.z);
    if (cf !== null && world.playerPos.y > cf - 0.6) gy = Math.max(gy, cf);

    // Jump (Space doubles as the bike brake, which is unused on foot).
    if (keys.brake && world.playerVelY === 0) world.playerVelY = 7.5;

    // Designed-terrain ground (kept for future ramps/jumps).
    world.playerVelY -= GRAVITY * step;
    world.playerPos.y += world.playerVelY * step;
    if (world.playerPos.y <= gy) {
      world.playerPos.y = gy;
      world.playerVelY = 0;
    }

    const fixed = collideWorld(world.playerPos.x, world.playerPos.z, 0.5);
    world.playerPos.x = fixed.x;
    world.playerPos.z = fixed.z;
    // Don't stand through the shuttle train.
    const tf = collideTrain(world.playerPos.x, world.playerPos.z, 0.5);
    world.playerPos.x = tf.x;
    world.playerPos.z = tf.z;
  }

  // Walk-cycle phase for limb animation.
  if (world.playerMoving) {
    const rate = world.playerRunning ? 11 : 8;
    world.walkPhase += step * rate * Math.min(world.playerSpeed / WALK_SPEED, 1.6);
  }
}
