// Arcade motorcycle controller. Deliberately simple: no slip, no gears —
// throttle, brake, and speed-scaled steering with smoothing.
// Same framework-free style as playerController for future server reuse.

import {
  BIKE_ACCEL,
  BIKE_BRAKE,
  BIKE_DRAG,
  BIKE_MAX_REVERSE,
  BIKE_MAX_SPEED,
  BIKE_REVERSE_ACCEL,
  BIKE_STEER_SPEED,
  BIKE_TURN_RATE,
} from "./gameConstants";
import { collideLibrary } from "./playerController";
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

export function updateBike(world: GameWorld, dt: number) {
  const { keys } = world;
  const step = Math.min(dt, 1 / 20);
  const throttle = keys.forward;
  const reverse = keys.back;

  if (throttle) {
    world.bikeSpeed += BIKE_ACCEL * step;
  } else if (reverse) {
    if (world.bikeSpeed > 0.5) {
      // S while moving forward = brake
      world.bikeSpeed -= BIKE_BRAKE * 0.7 * step;
    } else {
      world.bikeSpeed -= BIKE_REVERSE_ACCEL * step;
    }
  } else {
    // Coast down with drag
    const drag = BIKE_DRAG * step;
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
  world.bikeYaw +=
    world.bikeSteer *
    BIKE_TURN_RATE *
    speedFactor *
    stability *
    direction *
    step;

  const fx = Math.sin(world.bikeYaw);
  const fz = Math.cos(world.bikeYaw);
  world.bikePos.x += fx * world.bikeSpeed * step;
  world.bikePos.z += fz * world.bikeSpeed * step;
  world.bikePos.y = 0;

  const fixed = collideLibrary(world.bikePos.x, world.bikePos.z, 1.1);
  if (fixed.x !== world.bikePos.x || fixed.z !== world.bikePos.z) {
    world.bikePos.x = fixed.x;
    world.bikePos.z = fixed.z;
    world.bikeSpeed *= 0.3; // scrub speed on impact
  }

  world.wheelSpin += (world.bikeSpeed / 0.35) * step;
}
