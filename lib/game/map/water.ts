// Authored water bodies: pond + village pond, lake, river (pond → lake),
// and a western ocean with a sandy shore. Meters, hand-placed.

import { WORLD_HALF } from "./terrain";

export interface WaterDisc {
  x: number;
  z: number;
  r: number;
}

export const POND: WaterDisc = { x: -50, z: 45, r: 18 };
export const VILLAGE_POND: WaterDisc = { x: 7025, z: 32, r: 14 };
export const LAKE: WaterDisc = { x: 350, z: 250, r: 45 };

export const RIVER_POINTS: [number, number][] = [
  [-50, 45],
  [30, 95],
  [130, 115],
  [230, 175],
  [350, 250],
];
export const RIVER_WIDTH = 7;

export const OCEAN = { minX: -1600, maxX: -400, minZ: -300, maxZ: 300 };
/** Shoreline: water west of this, walkable beach just east of it. */
export const SHORE_X = -400;

/** Where birds land to drink: [x, z] at the water's edge. */
export const DRINK_SPOTS: [number, number][] = [
  [POND.x + POND.r + 1, POND.z],
  [POND.x, POND.z + POND.r + 1],
  [LAKE.x - LAKE.r - 1, LAKE.z],
  [LAKE.x, LAKE.z - LAKE.r - 1],
  [130, 115 + RIVER_WIDTH / 2 + 1.5],
  [SHORE_X + 2, 20],
  [VILLAGE_POND.x + VILLAGE_POND.r + 1, VILLAGE_POND.z],
];

/** Nearest drink spot indices to a point (for bird missions). */
export function nearestDrinkSpots(x: number, z: number, n = 3): number[] {
  return DRINK_SPOTS.map(([sx, sz], i): [number, number] => [
    Math.hypot(sx - x, sz - z),
    i,
  ])
    .sort((a, b) => a[0] - b[0])
    .slice(0, n)
    .map(([, i]) => i);
}

export interface WaterContact {
  inWater: boolean;
  /** 0 at the edge → 1 at the deepest point. */
  depth: number;
}

function distToPolyline(x: number, z: number, pts: [number, number][]): number {
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
export function waterAt(x: number, z: number): WaterContact {
  for (const p of [POND, LAKE, VILLAGE_POND]) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r) return { inWater: true, depth: Math.min(1, Math.max(0.15, 1 - d / p.r)) };
  }
  if (distToPolyline(x, z, RIVER_POINTS) < RIVER_WIDTH / 2) {
    return { inWater: true, depth: 0.5 };
  }
  if (x >= -WORLD_HALF && x <= SHORE_X && Math.abs(z) <= 300) {
    return { inWater: true, depth: 0.4 };
  }
  return { inWater: false, depth: 0 };
}
