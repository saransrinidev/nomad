// Authored village data: "Maple Village", 7 km east of spawn.
// Explicit hand-placed layout (no randomness). Axis-aligned footprints so
// collision stays a cheap AABB test per house.

export const VILLAGE_CENTER: [number, number, number] = [7000, 0, 0];
export const VILLAGE_NAME = "MAPLE VILLAGE";

export interface VillageHouse {
  /** Offset from village center (meters). */
  dx: number;
  dz: number;
  w: number;
  d: number;
  h: number;
  wall: string;
  roof: string;
}

export const VILLAGE_HOUSES: VillageHouse[] = [
  { dx: -18, dz: -12, w: 10, d: 8, h: 5, wall: "#d9b382", roof: "#8a4a3a" },
  { dx: 5, dz: -20, w: 12, d: 9, h: 6, wall: "#c9a876", roof: "#7a4a3a" },
  { dx: 24, dz: -8, w: 9, d: 8, h: 4.5, wall: "#e0cfa8", roof: "#5a6b7a" },
  { dx: -20, dz: 14, w: 11, d: 9, h: 5.5, wall: "#d4b48c", roof: "#8a4a3a" },
  { dx: 2, dz: 18, w: 10, d: 8, h: 5, wall: "#cbb28a", roof: "#6b4a3a" },
  { dx: 26, dz: 12, w: 12, d: 10, h: 6, wall: "#d9b382", roof: "#7a4a3a" },
  { dx: -4, dz: -30, w: 9, d: 7, h: 4.5, wall: "#e3cfa5", roof: "#8a5a3a" },
];

/** Static trees ringing the village (offsets from center). */
export const VILLAGE_TREES: { dx: number; dz: number; s: number }[] = [
  { dx: -38, dz: -28, s: 1.1 },
  { dx: 40, dz: -26, s: 0.9 },
  { dx: -40, dz: 30, s: 1.2 },
  { dx: 38, dz: 32, s: 1.0 },
  { dx: 0, dz: -42, s: 1.1 },
  { dx: -8, dz: 42, s: 0.85 },
];

export interface VillageCollider {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
}

/** Absolute-position AABB colliders (houses + well). */
export const VILLAGE_COLLIDERS: VillageCollider[] = [
  ...VILLAGE_HOUSES.map((h) => ({
    x: VILLAGE_CENTER[0] + h.dx,
    z: VILLAGE_CENTER[2] + h.dz,
    halfX: h.w / 2 + 0.4,
    halfZ: h.d / 2 + 0.4,
  })),
  { x: VILLAGE_CENTER[0], z: VILLAGE_CENTER[2], halfX: 1.8, halfZ: 1.8 },
];
