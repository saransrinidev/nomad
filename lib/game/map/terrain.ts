// Designed-terrain store: bounded 8x8 km heightfield (384^2 verts, 1 tile =
// 1 km). Single module singleton shared by the mesh, the editor, and the
// physics samplers. Pure data + math (type-only Three.js for the mesh link).

import type * as THREE from "three";

export const WORLD_SIZE = 1000; // 1x1 km charted land
export const WORLD_HALF = WORLD_SIZE / 2;
export const TILE_METERS = 1000;
export const TILES_PER_SIDE = 1;
export const TERRAIN_RES = 384; // verts per side (~2.6 m cells)
export const CELL = WORLD_SIZE / (TERRAIN_RES - 1);
export const TERRAIN_MIN_H = -8;
export const TERRAIN_MAX_H = 60;

/** Paint layers: grass, dirt, sand, rock, asphalt. */
export type PaintLayer = 0 | 1 | 2 | 3 | 4;
export const PAINT_COLORS = ["#7fbf5f", "#9a7d55", "#d9c48f", "#8d8d94", "#3f4448"];

export interface TerrainData {
  heights: Float32Array;
  paint: Uint8Array;
}

let terrain: TerrainData | null = null;
let terrainVersion = 0;

export function createTerrain(): TerrainData {
  return {
    heights: new Float32Array(TERRAIN_RES * TERRAIN_RES),
    paint: new Uint8Array(TERRAIN_RES * TERRAIN_RES), // all grass
  };
}

export function getTerrain(): TerrainData {
  if (!terrain) terrain = createTerrain();
  return terrain;
}

export function resetTerrain() {
  terrain = createTerrain();
  terrainVersion++;
}

export function getTerrainVersion() {
  return terrainVersion;
}

function markDirty() {
  terrainVersion++;
}

export function worldToGrid(x: number, z: number): [number, number] {
  const ix = Math.min(
    TERRAIN_RES - 1,
    Math.max(0, Math.round((x + WORLD_HALF) / CELL)),
  );
  const iz = Math.min(
    TERRAIN_RES - 1,
    Math.max(0, Math.round((z + WORLD_HALF) / CELL)),
  );
  return [ix, iz];
}

/** Bilinear ground height in meters. Outside the island: seabed (-1.2). */
export function groundHeight(x: number, z: number): number {
  if (x < -WORLD_HALF || x > WORLD_HALF || z < -WORLD_HALF || z > WORLD_HALF) {
    return -1.2;
  }
  const t = getTerrain();
  const gx = (x + WORLD_HALF) / CELL;
  const gz = (z + WORLD_HALF) / CELL;
  const x0 = Math.min(TERRAIN_RES - 2, Math.max(0, Math.floor(gx)));
  const z0 = Math.min(TERRAIN_RES - 2, Math.max(0, Math.floor(gz)));
  const fx = Math.min(1, Math.max(0, gx - x0));
  const fz = Math.min(1, Math.max(0, gz - z0));
  const i = (ix: number, iz: number) => t.heights[iz * TERRAIN_RES + ix];
  const a = i(x0, z0);
  const b = i(x0 + 1, z0);
  const c = i(x0, z0 + 1);
  const d = i(x0 + 1, z0 + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Tile ID like "C4": A1 = north-west corner tile. */
export function tileIdFor(x: number, z: number): string {
  const col = Math.min(
    TILES_PER_SIDE - 1,
    Math.max(0, Math.floor((x + WORLD_HALF) / TILE_METERS)),
  );
  const row = Math.min(
    TILES_PER_SIDE - 1,
    Math.max(0, Math.floor((z + WORLD_HALF) / TILE_METERS)),
  );
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

export type SculptMode = "raise" | "lower" | "flatten" | "smooth";

/**
 * Sculpt `amount` meters at the brush center with cosine falloff.
 * For flatten, pass the target height (captured at stroke start).
 */
export function applyBrush(
  cx: number,
  cz: number,
  radius: number,
  amount: number,
  mode: SculptMode,
  flatHeight = 0,
) {
  const t = getTerrain();
  const [ccx, ccz] = worldToGrid(cx, cz);
  const cellR = Math.ceil(radius / CELL);
  const x0 = Math.max(0, ccx - cellR);
  const x1 = Math.min(TERRAIN_RES - 1, ccx + cellR);
  const z0 = Math.max(0, ccz - cellR);
  const z1 = Math.min(TERRAIN_RES - 1, ccz + cellR);
  for (let iz = z0; iz <= z1; iz++) {
    for (let ix = x0; ix <= x1; ix++) {
      const wx = ix * CELL - WORLD_HALF;
      const wz = iz * CELL - WORLD_HALF;
      const dist = Math.hypot(wx - cx, wz - cz);
      if (dist > radius) continue;
      const fall = 0.5 + 0.5 * Math.cos((dist / radius) * Math.PI);
      const idx = iz * TERRAIN_RES + ix;
      if (mode === "raise") {
        t.heights[idx] = Math.min(TERRAIN_MAX_H, t.heights[idx] + amount * fall);
      } else if (mode === "lower") {
        t.heights[idx] = Math.max(TERRAIN_MIN_H, t.heights[idx] - amount * fall);
      } else if (mode === "flatten") {
        const k = Math.min(1, amount * 2);
        t.heights[idx] += (flatHeight - t.heights[idx]) * k * fall;
      } else {
        // smooth: blend toward 3x3 average
        let sum = 0;
        let n = 0;
        for (let oz = -1; oz <= 1; oz++) {
          for (let ox = -1; ox <= 1; ox++) {
            const jx = Math.min(TERRAIN_RES - 1, Math.max(0, ix + ox));
            const jz = Math.min(TERRAIN_RES - 1, Math.max(0, iz + oz));
            sum += t.heights[jz * TERRAIN_RES + jx];
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

export function paintAt(cx: number, cz: number, radius: number, layer: PaintLayer) {
  const t = getTerrain();
  const [ccx, ccz] = worldToGrid(cx, cz);
  const cellR = Math.ceil(radius / CELL);
  const x0 = Math.max(0, ccx - cellR);
  const x1 = Math.min(TERRAIN_RES - 1, ccx + cellR);
  const z0 = Math.max(0, ccz - cellR);
  const z1 = Math.min(TERRAIN_RES - 1, ccz + cellR);
  for (let iz = z0; iz <= z1; iz++) {
    for (let ix = x0; ix <= x1; ix++) {
      const wx = ix * CELL - WORLD_HALF;
      const wz = iz * CELL - WORLD_HALF;
      if (Math.hypot(wx - cx, wz - cz) > radius) continue;
      t.paint[iz * TERRAIN_RES + ix] = layer;
    }
  }
  markDirty();
}

// ---- Editor plumbing (shared mutable session, no React) ----

export type EditorTool = SculptMode | "paint";

export interface EditorRuntime {
  tool: EditorTool;
  brushSize: number; // meters (diameter feel: radius = size/2? use radius directly)
  brushRadius: number; // meters
  strength: number; // meters/second for sculpt
  paintLayer: PaintLayer;
  cursorX: number;
  cursorZ: number;
  cursorValid: boolean;
  stroking: boolean;
  flatHeight: number;
}

export function createEditorRuntime(): EditorRuntime {
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
let terrainMesh: THREE.Object3D | null = null;
export function registerTerrainMesh(m: THREE.Object3D | null) {
  terrainMesh = m;
}
export function getTerrainMesh(): THREE.Object3D | null {
  return terrainMesh;
}
