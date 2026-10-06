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
import { BUILDING_DOORS, VILLAGE_COLLIDERS } from "./map/village";
import { groundHeight, WORLD_HALF } from "./map/terrain";
import { waterAt } from "./map/water";
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

/** World collision: village hut footprints. Water is wadable. */
export function collideWorld(
  x: number,
  z: number,
  radius: number,
): { x: number; z: number } {
  let p = { x, z };
  for (const c of VILLAGE_COLLIDERS) {
    p = collideBox(p.x, p.z, radius, c.x, c.z, c.halfX, c.halfZ);
  }
  return p;
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
  let targetSpeed = moving ? (running ? RUN_SPEED : WALK_SPEED) : 0;
  // Wading through shallow water drags movement down (outdoors only).
  if (!inside) {
    const wq = waterAt(world.playerPos.x, world.playerPos.z);
    if (wq.inWater) targetSpeed *= Math.max(0.35, 1 - 0.55 * wq.depth);
  }
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
    // Shoreline: the island ends at the map edge, ocean beyond.
    const B = WORLD_HALF;
    world.playerPos.x = Math.min(B, Math.max(-B, world.playerPos.x));
    world.playerPos.z = Math.min(B, Math.max(-B, world.playerPos.z));

    // Designed-terrain ground (kept for future ramps/jumps).
    const gy = groundHeight(world.playerPos.x, world.playerPos.z);
    world.playerVelY -= GRAVITY * step;
    world.playerPos.y += world.playerVelY * step;
    if (world.playerPos.y <= gy) {
      world.playerPos.y = gy;
      world.playerVelY = 0;
    }

    const fixed = collideWorld(world.playerPos.x, world.playerPos.z, 0.5);
    world.playerPos.x = fixed.x;
    world.playerPos.z = fixed.z;
  }

  // Walk-cycle phase for limb animation.
  if (world.playerMoving) {
    const rate = world.playerRunning ? 11 : 8;
    world.walkPhase += step * rate * Math.min(world.playerSpeed / WALK_SPEED, 1.6);
  }
}
