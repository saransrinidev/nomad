// On-foot character controller.
// Framework-free math operating on the shared GameWorld so the same logic
// can later run on a multiplayer server. Called every frame from Player.tsx.

import {
  GRAVITY,
  LIBRARY_COLLIDER,
  LIBRARY_POSITION,
  PLAYER_ACCEL,
  PLAYER_TURN_SPEED,
  RUN_SPEED,
  WALK_SPEED,
} from "./gameConstants";
import { VILLAGE_COLLIDERS } from "./map/village";
import { groundHeight, WORLD_HALF } from "./map/terrain";
import { waterAt } from "./map/water";
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

/** Push a point out of the library's box collider (XZ plane). */
export function collideLibrary(
  x: number,
  z: number,
  radius: number,
): { x: number; z: number } {
  const [lx, , lz] = LIBRARY_POSITION;
  const dx = x - lx;
  const dz = z - lz;
  const px = LIBRARY_COLLIDER.halfX + radius - Math.abs(dx);
  const pz = LIBRARY_COLLIDER.halfZ + radius - Math.abs(dz);
  if (px > 0 && pz > 0) {
    if (px < pz) return { x: lx + Math.sign(dx || 1) * (LIBRARY_COLLIDER.halfX + radius), z };
    return { x, z: lz + Math.sign(dz || 1) * (LIBRARY_COLLIDER.halfZ + radius) };
  }
  return { x, z };
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

/** World collision: library + village buildings. Water is wadable. */
export function collideWorld(
  x: number,
  z: number,
  radius: number,
): { x: number; z: number } {
  let p = collideLibrary(x, z, radius);
  for (const c of VILLAGE_COLLIDERS) {
    p = collideBox(p.x, p.z, radius, c.x, c.z, c.halfX, c.halfZ);
  }
  return p;
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

  const running = keys.run && inZ > 0;
  let targetSpeed = moving ? (running ? RUN_SPEED : WALK_SPEED) : 0;
  // Wading through shallow water drags movement down.
  const wq = waterAt(world.playerPos.x, world.playerPos.z);
  if (wq.inWater) targetSpeed *= Math.max(0.35, 1 - 0.55 * wq.depth);
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

  // Walk-cycle phase for limb animation.
  if (world.playerMoving) {
    const rate = world.playerRunning ? 11 : 8;
    world.walkPhase += step * rate * Math.min(world.playerSpeed / WALK_SPEED, 1.6);
  }
}
