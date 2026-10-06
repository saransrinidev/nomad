"use strict";
// Shared Google-style map renderer (canvas 2D, framework-free).
// Used by both the corner minimap and the fullscreen BigMap: green terrain,
// blue water, POI markers, bike pin, blue-dot player, compass N.
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAP_WATER = exports.MAP_LAND = void 0;
exports.renderMap = renderMap;
const village_1 = require("@/lib/game/map/village");
const water_1 = require("@/lib/game/map/water");
const terrain_1 = require("@/lib/game/map/terrain");
exports.MAP_LAND = "#b3e0ae";
exports.MAP_WATER = "#aad3df";
const POI_TEXT = "#5f6368";
const GOOGLE_BLUE = "#1a73e8";
const GOOGLE_RED = "#ea4335";
function renderMap(ctx, size, range, snap, opts = {}) {
    const s = size / (range * 2); // px per meter
    const C = size / 2;
    const headAngle = Math.atan2(Math.sin(snap.yaw), -Math.cos(snap.yaw));
    // Ocean background, then the green island on top (both rotate together).
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = exports.MAP_WATER;
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.clip();
    // In heading-up mode, rotate the world so travel direction is up.
    ctx.save();
    ctx.translate(C, C);
    if (!snap.northUp)
        ctx.rotate(-headAngle);
    ctx.translate(-C, -C);
    const toMap = (x, z) => [
        C + (x - snap.focusX) * s,
        C + (z - snap.focusZ) * s,
    ];
    {
        const [ix0, iz0] = toMap(-terrain_1.WORLD_HALF, -terrain_1.WORLD_HALF);
        ctx.fillStyle = exports.MAP_LAND;
        ctx.fillRect(ix0, iz0, terrain_1.WORLD_HALF * 2 * s, terrain_1.WORLD_HALF * 2 * s);
    }
    // 100 m grid (big map).
    if (opts.grid) {
        ctx.strokeStyle = "rgba(0,0,0,0.09)";
        ctx.lineWidth = 1;
        for (let gx = -terrain_1.WORLD_HALF; gx <= terrain_1.WORLD_HALF; gx += 100) {
            const [ax] = toMap(gx, 0);
            ctx.beginPath();
            ctx.moveTo(ax, 0);
            ctx.lineTo(ax, size);
            ctx.stroke();
        }
        for (let gz = -terrain_1.WORLD_HALF; gz <= terrain_1.WORLD_HALF; gz += 100) {
            const [, bz] = toMap(0, gz);
            ctx.beginPath();
            ctx.moveTo(0, bz);
            ctx.lineTo(size, bz);
            ctx.stroke();
        }
        // Island border.
        const [bx0, bz0] = toMap(-terrain_1.WORLD_HALF, -terrain_1.WORLD_HALF);
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 2;
        ctx.strokeRect(bx0, bz0, terrain_1.WORLD_HALF * 2 * s, terrain_1.WORLD_HALF * 2 * s);
    }
    // Water bodies.
    ctx.fillStyle = exports.MAP_WATER;
    for (const p of [water_1.POND, water_1.LAKE, water_1.VILLAGE_POND]) {
        const [mx, mz] = toMap(p.x, p.z);
        ctx.beginPath();
        ctx.arc(mx, mz, Math.max(2, p.r * s), 0, Math.PI * 2);
        ctx.fill();
    }
    {
        const [ox, oz] = toMap(water_1.OCEAN.minX, water_1.OCEAN.minZ);
        ctx.fillRect(ox, oz, (water_1.OCEAN.maxX - water_1.OCEAN.minX) * s, (water_1.OCEAN.maxZ - water_1.OCEAN.minZ) * s);
    }
    // River.
    ctx.strokeStyle = exports.MAP_WATER;
    ctx.lineWidth = Math.max(1.5, water_1.RIVER_WIDTH * s);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    water_1.RIVER_POINTS.forEach(([px, pz], i) => {
        const [mx, mz] = toMap(px, pz);
        if (i === 0)
            ctx.moveTo(mx, mz);
        else
            ctx.lineTo(mx, mz);
    });
    ctx.stroke();
    // Village marker (only when in view).
    {
        const [vx, , vz] = village_1.VILLAGE_CENTER;
        const [mx, mz] = toMap(vx, vz);
        if (Math.hypot(mx - C, mz - C) <= C - 18) {
            ctx.fillStyle = "#7fb069";
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(mx, mz, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = POI_TEXT;
            ctx.font = "600 9px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Village", mx, mz + 20);
        }
    }
    // Bike pin (only when on foot).
    if (!snap.riding) {
        const [bx, bz] = toMap(snap.bikeX, snap.bikeZ);
        ctx.fillStyle = GOOGLE_RED;
        ctx.beginPath();
        ctx.arc(bx, bz, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    // Back to screen space for player dot.
    ctx.restore();
    // Player blue dot with heading wedge.
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(snap.northUp ? headAngle : 0);
    ctx.fillStyle = GOOGLE_BLUE;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(7, 4);
    ctx.lineTo(-7, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(26,115,232,0.18)";
    ctx.beginPath();
    ctx.arc(C, C, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = GOOGLE_BLUE;
    ctx.beginPath();
    ctx.arc(C, C, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // North marker.
    {
        const nx = C - Math.sin(headAngle) * (C - 12);
        const ny = C - Math.cos(headAngle) * (C - 12);
        ctx.fillStyle = "#5f6368";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("N", snap.northUp ? C : nx, snap.northUp ? 14 : ny + 3);
    }
    ctx.restore();
}
