"use strict";
// Designed-terrain store: bounded 8x8 km heightfield (384^2 verts, 1 tile =
// 1 km). Single module singleton shared by the mesh, the editor, and the
// physics samplers. Pure data + math (type-only Three.js for the mesh link).
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAINT_COLORS = exports.TERRAIN_MAX_H = exports.TERRAIN_MIN_H = exports.CELL = exports.TERRAIN_RES = exports.TILES_PER_SIDE = exports.TILE_METERS = exports.WORLD_HALF = exports.WORLD_SIZE = void 0;
exports.createTerrain = createTerrain;
exports.getTerrain = getTerrain;
exports.resetTerrain = resetTerrain;
exports.getTerrainVersion = getTerrainVersion;
exports.worldToGrid = worldToGrid;
exports.groundHeight = groundHeight;
exports.tileIdFor = tileIdFor;
exports.applyBrush = applyBrush;
exports.paintAt = paintAt;
exports.createEditorRuntime = createEditorRuntime;
exports.registerTerrainMesh = registerTerrainMesh;
exports.getTerrainMesh = getTerrainMesh;
exports.WORLD_SIZE = 1000; // 1x1 km charted land
exports.WORLD_HALF = exports.WORLD_SIZE / 2;
exports.TILE_METERS = 1000;
exports.TILES_PER_SIDE = 1;
exports.TERRAIN_RES = 384; // verts per side (~2.6 m cells)
exports.CELL = exports.WORLD_SIZE / (exports.TERRAIN_RES - 1);
exports.TERRAIN_MIN_H = -8;
exports.TERRAIN_MAX_H = 60;
exports.PAINT_COLORS = ["#7fbf5f", "#9a7d55", "#d9c48f", "#8d8d94", "#3f4448"];
let terrain = null;
let terrainVersion = 0;
function createTerrain() {
    return {
        heights: new Float32Array(exports.TERRAIN_RES * exports.TERRAIN_RES),
        paint: new Uint8Array(exports.TERRAIN_RES * exports.TERRAIN_RES), // all grass
    };
}
function getTerrain() {
    if (!terrain)
        terrain = createTerrain();
    return terrain;
}
function resetTerrain() {
    terrain = createTerrain();
    terrainVersion++;
}
function getTerrainVersion() {
    return terrainVersion;
}
function markDirty() {
    terrainVersion++;
}
function worldToGrid(x, z) {
    const ix = Math.min(exports.TERRAIN_RES - 1, Math.max(0, Math.round((x + exports.WORLD_HALF) / exports.CELL)));
    const iz = Math.min(exports.TERRAIN_RES - 1, Math.max(0, Math.round((z + exports.WORLD_HALF) / exports.CELL)));
    return [ix, iz];
}
/** Bilinear ground height in meters. Outside the island: seabed (-1.2). */
function groundHeight(x, z) {
    if (x < -exports.WORLD_HALF || x > exports.WORLD_HALF || z < -exports.WORLD_HALF || z > exports.WORLD_HALF) {
        return -1.2;
    }
    const t = getTerrain();
    const gx = (x + exports.WORLD_HALF) / exports.CELL;
    const gz = (z + exports.WORLD_HALF) / exports.CELL;
    const x0 = Math.min(exports.TERRAIN_RES - 2, Math.max(0, Math.floor(gx)));
    const z0 = Math.min(exports.TERRAIN_RES - 2, Math.max(0, Math.floor(gz)));
    const fx = Math.min(1, Math.max(0, gx - x0));
    const fz = Math.min(1, Math.max(0, gz - z0));
    const i = (ix, iz) => t.heights[iz * exports.TERRAIN_RES + ix];
    const a = i(x0, z0);
    const b = i(x0 + 1, z0);
    const c = i(x0, z0 + 1);
    const d = i(x0 + 1, z0 + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
/** Tile ID like "C4": A1 = north-west corner tile. */
function tileIdFor(x, z) {
    const col = Math.min(exports.TILES_PER_SIDE - 1, Math.max(0, Math.floor((x + exports.WORLD_HALF) / exports.TILE_METERS)));
    const row = Math.min(exports.TILES_PER_SIDE - 1, Math.max(0, Math.floor((z + exports.WORLD_HALF) / exports.TILE_METERS)));
    return `${String.fromCharCode(65 + col)}${row + 1}`;
}
/**
 * Sculpt `amount` meters at the brush center with cosine falloff.
 * For flatten, pass the target height (captured at stroke start).
 */
function applyBrush(cx, cz, radius, amount, mode, flatHeight = 0) {
    const t = getTerrain();
    const [ccx, ccz] = worldToGrid(cx, cz);
    const cellR = Math.ceil(radius / exports.CELL);
    const x0 = Math.max(0, ccx - cellR);
    const x1 = Math.min(exports.TERRAIN_RES - 1, ccx + cellR);
    const z0 = Math.max(0, ccz - cellR);
    const z1 = Math.min(exports.TERRAIN_RES - 1, ccz + cellR);
    for (let iz = z0; iz <= z1; iz++) {
        for (let ix = x0; ix <= x1; ix++) {
            const wx = ix * exports.CELL - exports.WORLD_HALF;
            const wz = iz * exports.CELL - exports.WORLD_HALF;
            const dist = Math.hypot(wx - cx, wz - cz);
            if (dist > radius)
                continue;
            const fall = 0.5 + 0.5 * Math.cos((dist / radius) * Math.PI);
            const idx = iz * exports.TERRAIN_RES + ix;
            if (mode === "raise") {
                t.heights[idx] = Math.min(exports.TERRAIN_MAX_H, t.heights[idx] + amount * fall);
            }
            else if (mode === "lower") {
                t.heights[idx] = Math.max(exports.TERRAIN_MIN_H, t.heights[idx] - amount * fall);
            }
            else if (mode === "flatten") {
                const k = Math.min(1, amount * 2);
                t.heights[idx] += (flatHeight - t.heights[idx]) * k * fall;
            }
            else {
                // smooth: blend toward 3x3 average
                let sum = 0;
                let n = 0;
                for (let oz = -1; oz <= 1; oz++) {
                    for (let ox = -1; ox <= 1; ox++) {
                        const jx = Math.min(exports.TERRAIN_RES - 1, Math.max(0, ix + ox));
                        const jz = Math.min(exports.TERRAIN_RES - 1, Math.max(0, iz + oz));
                        sum += t.heights[jz * exports.TERRAIN_RES + jx];
                        n++;
                    }
                }
                const k = Math.min(1, amount);
                t.heights[idx] += (sum / n - t.heights[idx]) * k * fall;
            }
        }
    }
    markDirty();
}
function paintAt(cx, cz, radius, layer) {
    const t = getTerrain();
    const [ccx, ccz] = worldToGrid(cx, cz);
    const cellR = Math.ceil(radius / exports.CELL);
    const x0 = Math.max(0, ccx - cellR);
    const x1 = Math.min(exports.TERRAIN_RES - 1, ccx + cellR);
    const z0 = Math.max(0, ccz - cellR);
    const z1 = Math.min(exports.TERRAIN_RES - 1, ccz + cellR);
    for (let iz = z0; iz <= z1; iz++) {
        for (let ix = x0; ix <= x1; ix++) {
            const wx = ix * exports.CELL - exports.WORLD_HALF;
            const wz = iz * exports.CELL - exports.WORLD_HALF;
            if (Math.hypot(wx - cx, wz - cz) > radius)
                continue;
            t.paint[iz * exports.TERRAIN_RES + ix] = layer;
        }
    }
    markDirty();
}
function createEditorRuntime() {
    return {
        tool: "raise",
        brushSize: 120,
        brushRadius: 120,
        strength: 12,
        paintLayer: 1,
        cursorX: 0,
        cursorZ: 0,
        cursorValid: false,
        stroking: false,
        flatHeight: 0,
    };
}
// Terrain mesh registry: Terrain.tsx registers its mesh so the god camera
// can raycast brush strokes onto it.
let terrainMesh = null;
function registerTerrainMesh(m) {
    terrainMesh = m;
}
function getTerrainMesh() {
    return terrainMesh;
}
