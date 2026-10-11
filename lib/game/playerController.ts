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
import { bridgeTopAt, carryDelta, coachCapAt, coachFloorAt, collideBridgeRails, collideBuildings, collideStation, collideTrain, platformTopAt, stairTopAt } from "./map/railway";
import { riverFlowAt } from "./map/rivers";
import { groundHeight, WATER_SURFACE_Y, WORLD_HALF } from "./map/terrain";
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
 * access stairs, coach floors (incl. doorway bridge plates), rail bridge
 * decks over water. Elevated surfaces only catch bodies above them.
 */
export function surfaceY(x: number, z: number, py: number): number {
  let gy = groundHeight(x, z);
  const pf = platformTopAt(x, z, py);
  if (pf !== null) gy = Math.max(gy, pf);
  const st = stairTopAt(x, z, py);
  if (st !== null) gy = Math.max(gy, st);
  const cf = coachFloorAt(x, z);
  if (cf !== null && py > cf - 0.6) gy = Math.max(gy, cf);
  const br = bridgeTopAt(x, z, py);
  if (br !== null) gy = Math.max(gy, br);
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
    // Water cushions the landing (splash down instead of slamming rock).
    const effSlam =
      groundHeight(world.playerPos.x, world.playerPos.z) < WATER_SURFACE_Y - 0.4
        ? slam * 0.4
        : slam;
    if (effSlam > CRASH_BOUNCE_VY) {
      world.crashVel.y = effSlam * CRASH_BOUNCE_KEEP;
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
      world.stun = Math.min(CRASH_STUN_BASE + effSlam * CRASH_STUN_RATE, CRASH_STUN_MAX);
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
  const carry = carryDelta(world.playerPos.x, world.playerPos.z, world.playerPos.y);
  world.playerPos.x += carry.dx;
  world.playerPos.z += carry.dz;
  // River drift: feet at/below the surface get pushed downstream (still
  // water at the banks, full current mid-channel — see riverFlowAt).
  if (world.playerPos.y < WATER_SURFACE_Y + 0.2) {
    const flow = riverFlowAt(world.playerPos.x, world.playerPos.z);
    world.playerPos.x += flow.dx * step;
    world.playerPos.z += flow.dz * step;
  }
  const B = WORLD_HALF;
  world.playerPos.x = Math.min(B, Math.max(-B, world.playerPos.x));
  world.playerPos.z = Math.min(B, Math.max(-B, world.playerPos.z));

  // Ground: terrain, station platform tops + access stairs, coach
  // floors (incl. doorway bridge plates). Elevated surfaces only catch
  // players above them.
  const gy = surfaceY(world.playerPos.x, world.playerPos.z, world.playerPos.y);

  // Swimming: bed well under the surface (elevated floors/decks raise gy
  // out of this automatically). Buoyancy floats the body, strokes run at
  // 40% speed — water is hard — and there is no sprint or jump in it.
  const swimming = gy < WATER_SURFACE_Y - 0.4;
  world.playerSwimming = swimming;
  if (swimming) {
    world.playerSpeed = damp(world.playerSpeed, WALK_SPEED * 0.4, PLAYER_ACCEL, step);
    world.playerMoving = world.playerSpeed > 0.25;
    world.playerRunning = false;
  }

  // Jump (Space doubles as the bike brake, which is unused on foot).
  if (keys.brake && world.playerVelY === 0 && !stunned && !swimming) world.playerVelY = 7.5;

  // Designed-terrain ground (kept for future ramps/jumps).
  world.playerVelY -= GRAVITY * step;
  world.playerPos.y += world.playerVelY * step;
  // Bridge mantle: rising toward a deck from below grabs it (vault up to
  // 1.6 m under the top). Anything lower genuinely can't reach — walk out
  // via the banks instead of teleporting up impossible heights.
  if (world.playerVelY > 0) {
    const grab = bridgeTopAt(world.playerPos.x, world.playerPos.z, world.playerPos.y, 1.0);
    if (grab !== null && world.playerPos.y <= grab - 0.6) {
      world.playerPos.y = grab;
      world.playerVelY = 0;
    }
  }
  if (swimming) {
    // Float: ease feet to just under the surface, head stays dry. No
    // gravity accumulation down here (and no ground snap to the bed).
    const floatY = WATER_SURFACE_Y - 1.15;
    world.playerPos.y += (floatY - world.playerPos.y) * Math.min(1, 8 * step);
    world.playerVelY = 0;
  } else if (world.playerPos.y <= gy) {
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
  const tf = collideTrain(world.playerPos.x, world.playerPos.z, 0.5, world.playerPos.y);
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
  // Bridge side railings corral bodies at deck height (free below for
  // wading under, free above for deliberate hops over the side).
  const br = collideBridgeRails(world.playerPos.x, world.playerPos.z, 0.5, world.playerPos.y);
  world.playerPos.x = br.x;
  world.playerPos.z = br.z;

  // Walk-cycle phase for limb animation.
  if (world.playerMoving) {
    const rate = world.playerRunning ? 11 : 8;
    world.walkPhase += step * rate * Math.min(world.playerSpeed / WALK_SPEED, 1.6);
  }
}
