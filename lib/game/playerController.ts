// On-foot character controller.
// Framework-free math operating on the shared GameWorld so the same logic
// can later run on a multiplayer server. Called every frame from Player.tsx.

import {
  CRASH_BOUNCE_KEEP,
  CRASH_BOUNCE_VY,
  CRASH_STUN_BASE,
  CRASH_STUN_MAX,
  CRASH_STUN_RATE,
  GRAVITY,
  PLAYER_ACCEL,
  PLAYER_TURN_SPEED,
  RUN_SPEED,
  WALK_SPEED,
} from "./gameConstants";
import { carryDelta, coachCapAt, coachFloorAt, collideBuildings, collideStation, collideTrain, platformTopAt, stairTopAt } from "./map/railway";
import { groundHeight, WORLD_HALF } from "./map/terrain";
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

/** World collision: open land — no buildings, everything free to walk through. */
export function collideWorld(x: number, z: number): { x: number; z: number } {
  return { x, z };
}

/**
 * Highest walkable surface under a point: terrain, station platform tops +
 * access stairs, coach floors (incl. doorway bridge plates). Elevated
 * surfaces only catch bodies above them.
 */
export function surfaceY(x: number, z: number, py: number): number {
  let gy = groundHeight(x, z);
  const pf = platformTopAt(x, z, py);
  if (pf !== null) gy = Math.max(gy, pf);
  const st = stairTopAt(x, z, py);
  if (st !== null) gy = Math.max(gy, st);
  const cf = coachFloorAt(x, z);
  if (cf !== null && py > cf - 0.6) gy = Math.max(gy, cf);
  return gy;
}

/**
 * Ballistic crash flight: semi-implicit Euler under GRAVITY, map-edge
 * clamped. A hard slam (vy past CRASH_BOUNCE_VY) bounces once, damped;
 * otherwise the rider lands, stops, and is dazed (stun scales with slam).
 */
function updateCrashFlight(world: GameWorld, step: number) {
  world.crashVel.y -= GRAVITY * step;
  world.playerPos.x += world.crashVel.x * step;
  world.playerPos.y += world.crashVel.y * step;
  world.playerPos.z += world.crashVel.z * step;
  // Fast phase advance drives the airborne flail animation in Player.tsx.
  world.walkPhase += step * 14;
  const B = WORLD_HALF;
  world.playerPos.x = Math.min(B, Math.max(-B, world.playerPos.x));
  world.playerPos.z = Math.min(B, Math.max(-B, world.playerPos.z));
  const gy = surfaceY(world.playerPos.x, world.playerPos.z, world.playerPos.y);
  if (world.playerPos.y <= gy) {
    world.playerPos.y = gy;
    const slam = -world.crashVel.y;
    if (slam > CRASH_BOUNCE_VY) {
      world.crashVel.y = slam * CRASH_BOUNCE_KEEP;
      world.crashVel.x *= 0.5;
      world.crashVel.z *= 0.5;
      world.crashSpin *= 0.5;
    } else {
      world.crashFlying = false;
      world.crashVel.set(0, 0, 0);
      world.crashSpin = 0;
      world.playerVelY = 0;
      world.playerSpeed = 0;
      world.playerMoving = false;
      world.stun = Math.min(CRASH_STUN_BASE + slam * CRASH_STUN_RATE, CRASH_STUN_MAX);
    }
  }
}

export function updateOnFoot(world: GameWorld, dt: number) {
  const { keys } = world;
  const step = Math.min(dt, 1 / 20);

  // Crash flight bypasses all locomotion until landing.
  if (world.crashFlying) {
    updateCrashFlight(world, step);
    return;
  }
  if (world.stun > 0) world.stun = Math.max(0, world.stun - step);
  const stunned = world.stun > 0;

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
  const moving = len > 0.01 && !stunned;
  if (moving) {
    dirX /= len;
    dirZ /= len;
  } else {
    dirX = 0;
    dirZ = 0;
  }

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

  // Ride along when standing inside a moving coach (applied before input
  // so WASD stays relative to the car).
  const carry = carryDelta(world.playerPos.x, world.playerPos.z);
  world.playerPos.x += carry.dx;
  world.playerPos.z += carry.dz;

  // Shoreline: the island ends at the map edge.
  const B = WORLD_HALF;
  world.playerPos.x = Math.min(B, Math.max(-B, world.playerPos.x));
  world.playerPos.z = Math.min(B, Math.max(-B, world.playerPos.z));

  // Ground: terrain, station platform tops + access stairs, coach
  // floors (incl. doorway bridge plates). Elevated surfaces only catch
  // players above them.
  const gy = surfaceY(world.playerPos.x, world.playerPos.z, world.playerPos.y);

  // Jump (Space doubles as the bike brake, which is unused on foot).
  if (keys.brake && world.playerVelY === 0 && !stunned) world.playerVelY = 7.5;

  // Designed-terrain ground (kept for future ramps/jumps).
  world.playerVelY -= GRAVITY * step;
  world.playerPos.y += world.playerVelY * step;
  if (world.playerPos.y <= gy) {
    world.playerPos.y = gy;
    world.playerVelY = 0;
  }
  // Coach roof: cap the jump inside a coach so riders can hop but never
  // pop out through the roof (cabin headroom is ~2 m, a full jump is ~1.3 m).
  const cap = coachCapAt(world.playerPos.x, world.playerPos.z);
  if (cap !== null && world.playerPos.y > cap) {
    world.playerPos.y = cap;
    if (world.playerVelY > 0) world.playerVelY = 0;
  }

  const fixed = collideWorld(world.playerPos.x, world.playerPos.z);
  world.playerPos.x = fixed.x;
  world.playerPos.z = fixed.z;
  // Don't stand through the shuttle train.
  const tf = collideTrain(world.playerPos.x, world.playerPos.z, 0.5);
  world.playerPos.x = tf.x;
  world.playerPos.z = tf.z;
  // Station walls, posts and furniture are solid (stairs stay walkable).
  const sc = collideStation(world.playerPos.x, world.playerPos.z, 0.5, world.playerPos.y);
  world.playerPos.x = sc.x;
  world.playerPos.z = sc.z;
  // Station buildings (concourse halls) are solid too.
  const bc = collideBuildings(world.playerPos.x, world.playerPos.z, 0.5, world.playerPos.y);
  world.playerPos.x = bc.x;
  world.playerPos.z = bc.z;

  // Walk-cycle phase for limb animation.
  if (world.playerMoving) {
    const rate = world.playerRunning ? 11 : 8;
    world.walkPhase += step * rate * Math.min(world.playerSpeed / WALK_SPEED, 1.6);
  }
}
