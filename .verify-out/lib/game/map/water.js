"use strict";
// Authored water bodies: pond + village pond, lake, river (pond → lake),
// and a western ocean with a sandy shore. Meters, hand-placed.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DRINK_SPOTS = exports.SHORE_X = exports.OCEAN = exports.RIVER_WIDTH = exports.RIVER_POINTS = exports.LAKE = exports.VILLAGE_POND = exports.POND = void 0;
exports.nearestDrinkSpots = nearestDrinkSpots;
exports.waterAt = waterAt;
const terrain_1 = require("./terrain");
exports.POND = { x: -50, z: 45, r: 18 };
exports.VILLAGE_POND = { x: 7025, z: 32, r: 14 };
exports.LAKE = { x: 350, z: 250, r: 45 };
exports.RIVER_POINTS = [
    [-50, 45],
    [30, 95],
    [130, 115],
    [230, 175],
    [350, 250],
];
exports.RIVER_WIDTH = 7;
exports.OCEAN = { minX: -1600, maxX: -400, minZ: -300, maxZ: 300 };
/** Shoreline: water west of this, walkable beach just east of it. */
exports.SHORE_X = -400;
/** Where birds land to drink: [x, z] at the water's edge. */
exports.DRINK_SPOTS = [
    [exports.POND.x + exports.POND.r + 1, exports.POND.z],
    [exports.POND.x, exports.POND.z + exports.POND.r + 1],
    [exports.LAKE.x - exports.LAKE.r - 1, exports.LAKE.z],
    [exports.LAKE.x, exports.LAKE.z - exports.LAKE.r - 1],
    [130, 115 + exports.RIVER_WIDTH / 2 + 1.5],
    [exports.SHORE_X + 2, 20],
    [exports.VILLAGE_POND.x + exports.VILLAGE_POND.r + 1, exports.VILLAGE_POND.z],
];
/** Nearest drink spot indices to a point (for bird missions). */
function nearestDrinkSpots(x, z, n = 3) {
    return exports.DRINK_SPOTS.map(([sx, sz], i) => [
        Math.hypot(sx - x, sz - z),
        i,
    ])
        .sort((a, b) => a[0] - b[0])
        .slice(0, n)
        .map(([, i]) => i);
}
function distToPolyline(x, z, pts) {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const dx = bx - ax;
        const dz = bz - az;
        const len2 = dx * dx + dz * dz;
        const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
        best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
    return best;
}
/** Shallow-water query for wading, splash, and ripples. */
function waterAt(x, z) {
    for (const p of [exports.POND, exports.LAKE, exports.VILLAGE_POND]) {
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < p.r)
            return { inWater: true, depth: Math.min(1, Math.max(0.15, 1 - d / p.r)) };
    }
    if (distToPolyline(x, z, exports.RIVER_POINTS) < exports.RIVER_WIDTH / 2) {
        return { inWater: true, depth: 0.5 };
    }
    if (x >= -terrain_1.WORLD_HALF && x <= exports.SHORE_X && Math.abs(z) <= 300) {
        return { inWater: true, depth: 0.4 };
    }
    return { inWater: false, depth: 0 };
}
