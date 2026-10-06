"use strict";
// On-foot character controller.
// Framework-free math operating on the shared GameWorld so the same logic
// can later run on a multiplayer server. Called every frame from Player.tsx.
Object.defineProperty(exports, "__esModule", { value: true });
exports.collideWorld = collideWorld;
exports.clampToRoom = clampToRoom;
exports.nearestDoor = nearestDoor;
exports.updateOnFoot = updateOnFoot;
const gameConstants_1 = require("./gameConstants");
const village_1 = require("./map/village");
const terrain_1 = require("./map/terrain");
const water_1 = require("./map/water");
const interior_1 = require("./map/interior");
const gameConstants_2 = require("./gameConstants");
function damp(current, target, rate, dt) {
    const t = 1 - Math.exp(-rate * dt);
    return current + (target - current) * t;
}
function lerpAngle(current, target, rate, dt) {
    let delta = (target - current) % (Math.PI * 2);
    if (delta > Math.PI)
        delta -= Math.PI * 2;
    if (delta < -Math.PI)
        delta += Math.PI * 2;
    const t = 1 - Math.exp(-rate * dt);
    return current + delta * t;
}
function collideBox(x, z, radius, bx, bz, halfX, halfZ) {
    const dx = x - bx;
    const dz = z - bz;
    const px = halfX + radius - Math.abs(dx);
    const pz = halfZ + radius - Math.abs(dz);
    if (px > 0 && pz > 0) {
        if (px < pz)
            return { x: bx + Math.sign(dx || 1) * (halfX + radius), z };
        return { x, z: bz + Math.sign(dz || 1) * (halfZ + radius) };
    }
    return { x, z };
}
/** World collision: village hut footprints. Water is wadable. */
function collideWorld(x, z, radius) {
    let p = { x, z };
    for (const c of village_1.VILLAGE_COLLIDERS) {
        p = collideBox(p.x, p.z, radius, c.x, c.z, c.halfX, c.halfZ);
    }
    return p;
}
/** Keep the player inside the interior room (local coords centered at origin). */
function clampToRoom(x, z, radius) {
    const lx = interior_1.ROOM_HALF_X - interior_1.WALL_T - radius;
    const lz = interior_1.ROOM_HALF_Z - interior_1.WALL_T - radius;
    return {
        x: Math.min(lx, Math.max(-lx, x)),
        z: Math.min(lz, Math.max(-lz, z)),
    };
}
/**
 * Index of the nearest enterable door within INTERACT_DISTANCE, or null.
 * Outdoors only — used by GameRig to drive the "Press E to enter" prompt.
 */
function nearestDoor(world) {
    if (world.mode !== "walk" || world.interior !== null)
        return null;
    let best = null;
    let bestD = gameConstants_2.INTERACT_DISTANCE;
    for (let i = 0; i < village_1.BUILDING_DOORS.length; i++) {
        const d = village_1.BUILDING_DOORS[i];
        const dist = Math.hypot(world.playerPos.x - d.x, world.playerPos.z - d.z);
        if (dist < bestD) {
            bestD = dist;
            best = i;
        }
    }
    return best;
}
function updateOnFoot(world, dt) {
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
    let targetSpeed = moving ? (running ? gameConstants_1.RUN_SPEED : gameConstants_1.WALK_SPEED) : 0;
    // Wading through shallow water drags movement down (outdoors only).
    if (!inside) {
        const wq = (0, water_1.waterAt)(world.playerPos.x, world.playerPos.z);
        if (wq.inWater)
            targetSpeed *= Math.max(0.35, 1 - 0.55 * wq.depth);
    }
    world.playerSpeed = damp(world.playerSpeed, targetSpeed, gameConstants_1.PLAYER_ACCEL, step);
    world.playerMoving = world.playerSpeed > 0.25;
    world.playerRunning = running && world.playerMoving;
    if (world.playerSpeed > 0.01 && moving) {
        const targetYaw = Math.atan2(dirX, dirZ);
        world.playerYaw = lerpAngle(world.playerYaw, targetYaw, gameConstants_1.PLAYER_TURN_SPEED, step);
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
    }
    else {
        // Shoreline: the island ends at the map edge, ocean beyond.
        const B = terrain_1.WORLD_HALF;
        world.playerPos.x = Math.min(B, Math.max(-B, world.playerPos.x));
        world.playerPos.z = Math.min(B, Math.max(-B, world.playerPos.z));
        // Designed-terrain ground (kept for future ramps/jumps).
        const gy = (0, terrain_1.groundHeight)(world.playerPos.x, world.playerPos.z);
        world.playerVelY -= gameConstants_1.GRAVITY * step;
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
        world.walkPhase += step * rate * Math.min(world.playerSpeed / gameConstants_1.WALK_SPEED, 1.6);
    }
}
