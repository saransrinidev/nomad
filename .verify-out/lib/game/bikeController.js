"use strict";
// Arcade motorcycle controller. Deliberately simple: no slip, no gears —
// throttle, brake, and speed-scaled steering with smoothing.
// Same framework-free style as playerController for future server reuse.
Object.defineProperty(exports, "__esModule", { value: true });
exports.bikeLeanAngle = bikeLeanAngle;
exports.updateBike = updateBike;
const gameConstants_1 = require("./gameConstants");
const playerController_1 = require("./playerController");
const terrain_1 = require("./map/terrain");
const water_1 = require("./map/water");
function damp(current, target, rate, dt) {
    const t = 1 - Math.exp(-rate * dt);
    return current + (target - current) * t;
}
function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}
/**
 * Visual roll angle for cornering. Shared by the bike body and the rider
 * so both lean equally into turns.
 */
function bikeLeanAngle(world) {
    const speedFactor = clamp(Math.abs(world.bikeSpeed) / 20, 0, 1);
    return -world.bikeSteer * 0.35 * speedFactor;
}
function updateBike(world, dt) {
    const { keys } = world;
    const step = Math.min(dt, 1 / 20);
    const throttle = keys.forward;
    const reverse = keys.back;
    if (throttle && world.engineOn) {
        // Torque taper: full punch off the line, fading toward top speed.
        // Dead throttle with the engine off falls through to drag below.
        const frac = clamp(world.bikeSpeed / gameConstants_1.BIKE_MAX_SPEED, 0, 1);
        world.bikeSpeed += gameConstants_1.BIKE_LAUNCH_ACCEL * (1 - gameConstants_1.BIKE_TAPER * frac * frac) * step;
    }
    else if (reverse) {
        if (world.bikeSpeed > 0.5) {
            // S while moving forward = brake (mechanical, works engine-off)
            world.bikeSpeed -= gameConstants_1.BIKE_BRAKE * 0.7 * step;
        }
        else if (world.engineOn) {
            world.bikeSpeed -= gameConstants_1.BIKE_REVERSE_ACCEL * step;
        }
        else {
            // Engine off: settle to a standstill instead of creeping.
            const d = gameConstants_1.BIKE_DRAG * step;
            if (Math.abs(world.bikeSpeed) <= d)
                world.bikeSpeed = 0;
            else
                world.bikeSpeed -= Math.sign(world.bikeSpeed) * d;
        }
    }
    else {
        // Coast down: base drag plus speed-proportional engine braking.
        const frac = clamp(Math.abs(world.bikeSpeed) / gameConstants_1.BIKE_MAX_SPEED, 0, 1);
        const drag = (gameConstants_1.BIKE_DRAG + gameConstants_1.BIKE_ENGINE_BRAKING * frac) * step;
        if (Math.abs(world.bikeSpeed) <= drag)
            world.bikeSpeed = 0;
        else
            world.bikeSpeed -= Math.sign(world.bikeSpeed) * drag;
    }
    if (keys.brake) {
        // Space = strong hand brake
        const b = gameConstants_1.BIKE_BRAKE * step;
        if (Math.abs(world.bikeSpeed) <= b)
            world.bikeSpeed = 0;
        else
            world.bikeSpeed -= Math.sign(world.bikeSpeed) * b;
    }
    world.bikeSpeed = clamp(world.bikeSpeed, gameConstants_1.BIKE_MAX_REVERSE, gameConstants_1.BIKE_MAX_SPEED);
    // Wading through shallow water soaks speed (capped crawl + extra drag).
    const wq = (0, water_1.waterAt)(world.bikePos.x, world.bikePos.z);
    if (wq.inWater) {
        const cap = 14;
        if (Math.abs(world.bikeSpeed) > cap) {
            const sgn = Math.sign(world.bikeSpeed);
            world.bikeSpeed = Math.max(cap, Math.abs(world.bikeSpeed) - 25 * step) * sgn;
        }
        const soak = 1 - Math.min(0.85, (0.4 + wq.depth) * step * 2);
        world.bikeSpeed *= soak;
        world.bikeVel.multiplyScalar(soak);
    }
    // Steering with smoothing; full authority at low speed, damped at
    // high speed so 150 km/h stays stable but still turnable.
    const steerInput = (keys.left ? 1 : 0) + (keys.right ? -1 : 0);
    world.bikeSteer = damp(world.bikeSteer, steerInput, gameConstants_1.BIKE_STEER_SPEED, step);
    const speedFactor = clamp(Math.abs(world.bikeSpeed) / 8, 0, 1);
    const stability = 1 - 0.55 * clamp(Math.abs(world.bikeSpeed) / gameConstants_1.BIKE_MAX_SPEED, 0, 1);
    const direction = world.bikeSpeed >= 0 ? 1 : -1;
    // Drift: braking + steering at speed breaks traction. The bike rotates
    // faster while velocity lags behind the heading (power-slide).
    const braking = keys.brake || (keys.back && world.bikeSpeed > 0.5);
    const drifting = braking && steerInput !== 0 && world.bikeSpeed > 8;
    world.bikeDrift = drifting;
    world.bikeYaw +=
        world.bikeSteer *
            gameConstants_1.BIKE_TURN_RATE *
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
    // Shoreline: the island ends at the map edge, ocean beyond.
    const B = terrain_1.WORLD_HALF;
    if (world.bikePos.x < -B || world.bikePos.x > B || world.bikePos.z < -B || world.bikePos.z > B) {
        world.bikePos.x = Math.min(B, Math.max(-B, world.bikePos.x));
        world.bikePos.z = Math.min(B, Math.max(-B, world.bikePos.z));
        world.bikeSpeed *= 0.4;
        world.bikeVel.multiplyScalar(0.4);
    }
    world.bikePos.y = (0, terrain_1.groundHeight)(world.bikePos.x, world.bikePos.z);
    const fixed = (0, playerController_1.collideWorld)(world.bikePos.x, world.bikePos.z, 1.1);
    if (fixed.x !== world.bikePos.x || fixed.z !== world.bikePos.z) {
        world.bikePos.x = fixed.x;
        world.bikePos.z = fixed.z;
        world.bikeSpeed *= 0.3; // scrub speed on impact
        world.bikeVel.multiplyScalar(0.3);
    }
    world.wheelSpin += (world.bikeSpeed / 0.35) * step;
}
