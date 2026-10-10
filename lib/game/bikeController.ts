// Arcade motorcycle controller. Deliberately simple: no slip, no gears —
// throttle, brake, and speed-scaled steering with smoothing.
// Same framework-free style as playerController for future server reuse.

import {
  BIKE_BRAKE,
  BIKE_DRAG,
  BIKE_ENGINE_BRAKING,
  BIKE_LAUNCH_ACCEL,
  BIKE_MAX_REVERSE,
  BIKE_MAX_SPEED,
  BIKE_REVERSE_ACCEL,
  BIKE_STEER_SPEED,
  BIKE_TAPER,
  BIKE_TURN_RATE,
  CRASH_KEEP,
  CRASH_MAX_FLY,
  CRASH_MIN_SPEED,
  CRASH_POP_BASE,
  CRASH_POP_MAX,
  CRASH_POP_RATE,
  CRASH_SPIN_BASE,
  CRASH_SPIN_MAX,
  CRASH_SPIN_RATE,
} from "./gameConstants";
import { collideWorld } from "./playerController";
import { collideBuildings, collideStation, collideTrain } from "./map/railway";
import { groundHeight, WORLD_HALF } from "./map/terrain";
import type { GameWorld } from "./state";

function damp(current: number, target: number, rate: number, dt: number) {
  const t = 1 - Math.exp(-rate * dt);
  return current + (target - current) * t;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Visual roll angle for cornering. Shared by the bike body and the rider
 * so both lean equally into turns.
 */
export function bikeLeanAngle(world: GameWorld): number {
  const speedFactor = clamp(Math.abs(world.bikeSpeed) / 20, 0, 1);
  return -world.bikeSteer * 0.35 * speedFactor;
}

/**
 * Launch the rider off the bike on a ballistic arc. Eject velocity keeps a
 * fraction of the impact speed horizontally (capped) plus a speed-scaled
 * vertical pop (capped); gravity (GRAVITY) does the rest in updateCrashFlight.
 * Mode flips to walk so the camera, HUD, and Player follow the flyer —
 * GameRig mirrors the change into React state (see onMode).
 */
function ejectRider(world: GameWorld, impactSpeed: number) {
  let dx = world.bikeVel.x;
  let dz = world.bikeVel.z;
  if (Math.hypot(dx, dz) < 0.01) {
    dx = Math.sin(world.bikeYaw);
    dz = Math.cos(world.bikeYaw);
  }
  const len = Math.hypot(dx, dz);
  const vh = Math.min(impactSpeed * CRASH_KEEP, CRASH_MAX_FLY);
  const vy = Math.min(CRASH_POP_BASE + impactSpeed * CRASH_POP_RATE, CRASH_POP_MAX);
  world.playerPos.set(
    world.bikePos.x + (dx / len) * 0.6,
    world.bikePos.y + 1.0,
    world.bikePos.z + (dz / len) * 0.6,
  );
  world.crashVel.set((dx / len) * vh, vy, (dz / len) * vh);
  world.playerVelY = 0;
  world.playerYaw = Math.atan2(dx, dz);
  world.crashSpin = Math.min(CRASH_SPIN_BASE + impactSpeed * CRASH_SPIN_RATE, CRASH_SPIN_MAX);
  world.crashFlying = true;
  world.stun = 0;
  world.playerSpeed = vh;
  world.playerMoving = true;
  world.mode = "walk";
  // The bike itself stops almost dead (small residual slide).
  world.bikeSpeed = 0;
  world.bikeVel.multiplyScalar(0.15);
  world.bikeDrift = false;
}

export function updateBike(world: GameWorld, dt: number) {
  const { keys } = world;
  const step = Math.min(dt, 1 / 20);
  const throttle = keys.forward;
  const reverse = keys.back;

  if (throttle && world.engineOn) {
    // Torque taper: full punch off the line, fading toward top speed.
    // Dead throttle with the engine off falls through to drag below.
    const frac = clamp(world.bikeSpeed / BIKE_MAX_SPEED, 0, 1);
    world.bikeSpeed += BIKE_LAUNCH_ACCEL * (1 - BIKE_TAPER * frac * frac) * step;
  } else if (reverse) {
    if (world.bikeSpeed > 0.5) {
      // S while moving forward = brake (mechanical, works engine-off)
      world.bikeSpeed -= BIKE_BRAKE * 0.7 * step;
    } else if (world.engineOn) {
      world.bikeSpeed -= BIKE_REVERSE_ACCEL * step;
    } else {
      // Engine off: settle to a standstill instead of creeping.
      const d = BIKE_DRAG * step;
      if (Math.abs(world.bikeSpeed) <= d) world.bikeSpeed = 0;
      else world.bikeSpeed -= Math.sign(world.bikeSpeed) * d;
    }
  } else {
    // Coast down: base drag plus speed-proportional engine braking.
    const frac = clamp(Math.abs(world.bikeSpeed) / BIKE_MAX_SPEED, 0, 1);
    const drag = (BIKE_DRAG + BIKE_ENGINE_BRAKING * frac) * step;
    if (Math.abs(world.bikeSpeed) <= drag) world.bikeSpeed = 0;
    else world.bikeSpeed -= Math.sign(world.bikeSpeed) * drag;
  }

  if (keys.brake) {
    // Space = strong hand brake
    const b = BIKE_BRAKE * step;
    if (Math.abs(world.bikeSpeed) <= b) world.bikeSpeed = 0;
    else world.bikeSpeed -= Math.sign(world.bikeSpeed) * b;
  }

  world.bikeSpeed = clamp(world.bikeSpeed, BIKE_MAX_REVERSE, BIKE_MAX_SPEED);

  // Steering with smoothing; full authority at low speed, damped at
  // high speed so 150 km/h stays stable but still turnable.
  const steerInput = (keys.left ? 1 : 0) + (keys.right ? -1 : 0);
  world.bikeSteer = damp(world.bikeSteer, steerInput, BIKE_STEER_SPEED, step);
  const speedFactor = clamp(Math.abs(world.bikeSpeed) / 8, 0, 1);
  const stability =
    1 - 0.55 * clamp(Math.abs(world.bikeSpeed) / BIKE_MAX_SPEED, 0, 1);
  const direction = world.bikeSpeed >= 0 ? 1 : -1;
  // Drift: braking + steering at speed breaks traction. The bike rotates
  // faster while velocity lags behind the heading (power-slide).
  const braking =
    keys.brake || (keys.back && world.bikeSpeed > 0.5);
  const drifting = braking && steerInput !== 0 && world.bikeSpeed > 8;
  world.bikeDrift = drifting;
  world.bikeYaw +=
    world.bikeSteer *
    BIKE_TURN_RATE *
    speedFactor *
    stability *
    direction *
    (drifting ? 1.6 : 1) *
    step;

  // Velocity follows heading with grip (snappy) or slides (drift).
  const fx = Math.sin(world.bikeYaw);
  const fz = Math.cos(world.bikeYaw);
  const grip = drifting ? 2.2 : 10;
  const k = 1 - Math.exp(-grip * step);
  world.bikeVel.x += (fx * world.bikeSpeed - world.bikeVel.x) * k;
  world.bikeVel.z += (fz * world.bikeSpeed - world.bikeVel.z) * k;
  world.bikePos.x += world.bikeVel.x * step;
  world.bikePos.z += world.bikeVel.z * step;
  // Shoreline: the island ends at the map edge.
  const B = WORLD_HALF;
  if (world.bikePos.x < -B || world.bikePos.x > B || world.bikePos.z < -B || world.bikePos.z > B) {
    world.bikePos.x = Math.min(B, Math.max(-B, world.bikePos.x));
    world.bikePos.z = Math.min(B, Math.max(-B, world.bikePos.z));
    world.bikeSpeed *= 0.4;
    world.bikeVel.multiplyScalar(0.4);
  }
  world.bikePos.y = groundHeight(world.bikePos.x, world.bikePos.z);

  const fixed = collideWorld(world.bikePos.x, world.bikePos.z);
  const tf = collideTrain(fixed.x, fixed.z, 1.1);
  // Bikes can't drive through platforms or station furniture either.
  const sc = collideStation(tf.x, tf.z, 1.1, world.bikePos.y);
  // ...nor through station buildings (concourse halls).
  const bc = collideBuildings(sc.x, sc.z, 1.1, world.bikePos.y);
  const hitWall =
    fixed.x !== world.bikePos.x || fixed.z !== world.bikePos.z;
  const hitTrain = tf.x !== fixed.x || tf.z !== fixed.z;
  const hitStation = sc.x !== tf.x || sc.z !== tf.z;
  const hitBuilding = bc.x !== sc.x || bc.z !== sc.z;
  if (hitWall || hitTrain || hitStation || hitBuilding) {
    const impactSpeed = world.bikeVel.length();
    world.bikePos.x = bc.x;
    world.bikePos.z = bc.z;
    if (impactSpeed >= CRASH_MIN_SPEED && !world.crashFlying && world.stun <= 0) {
      ejectRider(world, impactSpeed);
    } else {
      world.bikeSpeed *= 0.3; // scrub speed on impact
      world.bikeVel.multiplyScalar(0.3);
    }
  }

  world.wheelSpin += (world.bikeSpeed / 0.35) * step;
}
