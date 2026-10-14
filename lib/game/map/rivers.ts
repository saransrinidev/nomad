// Tamil Nadu rivers: Cauvery main stem + Kollidam branch (phase 1).
// Vaigai / Thamirabarani / tributaries slot into RIVERS the same way.
//
// Data + pure math only (projection via tamilnadu — no railway import, so
// terrain.ts can consume this with zero import cycles):
//   station <- railway <- terrain <- rivers <- tamilnadu
//
// Waypoints are [lon, lat, widthM?]: real courses, simplified. Widths are
// symbolic (the world runs ~1:41): 40 m gorges read as rivers without
// aliasing apart on the 20.8 m terrain grid.
//
// Ocean plane (y=0.3) is the water surface for free: carveRivers() cuts the
// bed to RIVER_BED_H (-1.5) with walkable sloped banks, paints sand +
// alluvial rings, and skips station exclusion discs so tracks/platforms
// never sit in water (rail bridges generate automatically where rails
// cross, via the existing deck/trestle machinery).

import { latLonToGame } from "./tamilnadu";

export interface RiverDef {
  id: string;
  name: string;
  /** [lon, lat, widthM?]: course west→east (source→sea). */
  points: [number, number, number?][];
}

const DEFAULT_WIDTH = 60;

/** Phase-1 rivers. Hogenakkal is the in-map source (Talakaveri itself at
 * lon 75.99 sits west of the world bbox, off-map by design). Waypoints are
 * routed so every segment stays 150 m+ from station premises (verified
 * numerically) — Erode gets a west bypass bow, Trichy threads between its
 * faces south (main) and north (Kollidam), delta cities pass south. */
export const RIVERS: RiverDef[] = [
  {
    id: "cauvery",
    name: "Cauvery",
    points: [
      [77.7709, 12.1195, 40], // Hogenakkal Falls (in-map source)
      [77.79, 11.95, 50], // Mettur approach
      [77.7956, 11.7997, 60], // Mettur Dam
      [77.91, 11.448, 60], // Bhavani confluence
      [77.68, 11.34, 55], // Erode bypass (west bow around the city)
      [77.63, 11.2, 55],
      [77.89, 11.08, 60], // Kodumudi (parallel S of kongu rail)
      [78.1, 11.03, 60], // Karur (north of city)
      [78.6, 10.72, 60], // Trichy (south-west of all faces)
      [78.72, 10.73, 60], // Trichy (south-east of all faces)
      [78.8155, 10.8306, 55], // Kallanai split
      [79.1, 10.73, 55], // Thanjavur (south of city)
      [79.2, 10.7, 55], // Thanjavur bow (keeps clear of premises)
      [79.36, 10.875, 55], // Kumbakonam (south of city)
      [79.58, 11.01, 55], // Mayiladuthurai (south-west, keeps clear)
      [79.7, 11.05, 55], // swing east before the mouth
      [79.8509, 11.1412, 60], // Poompuhar mouth (meets the sea)
    ],
  },
  {
    id: "kollidam",
    name: "Kollidam",
    points: [
      [78.8155, 10.8306, 50], // branches N off Kallanai
      [79.0, 10.95, 50],
      [79.3, 11.1, 50],
      [79.55, 11.28, 45],
      [79.695, 11.325, 45], // skirts Chidambaram (south)
      [79.8, 11.4, 50], // mouth
    ],
  },
];

/** Bed depth (world Y): well below the 0.3 ocean plane so open water reads
 * deep (wading chest-deep mid-channel); banks stay walkable. */
export const RIVER_BED_H = -3.5;
/** Mid-channel current (m/s) — slowed near the banks. Swimming (≈1.8 m/s)
 * barely beats it upstream: crossing is work, drifting is free. */
// Strong enough to visibly carry a floating bike downstream while still
// allowing the rider to fight the current with throttle.
export const RIVER_FLOW_SPEED = 3.2;
/** Bank run-out each side of the water edge (walkable slope, no traps). */
const BANK_W = 25;
/** Alluvial tint ring past the sand banks. */
const ALLUVIAL_W = 18;
/** No carving within this radius of a station base point (lon/lat — mirrors
 * railway.ts LINES so terrain never needs a railway import). */
const EXCLUSION_R = 150;
const STATION_PTS: [number, number][] = [
  [77.7245, 11.2756], // Erode
  [78.0733, 10.9601], // Karur
  [78.6856, 10.7905], // Trichy
  [79.1383, 10.7852], // Thanjavur
  [79.3846, 10.9617], // Kumbakonam
  [79.6528, 11.1012], // Mayiladuthurai
  [79.6936, 11.3997], // Chidambaram
];

interface Seg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  wa: number; // half-width at a
  wb: number; // half-width at b
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface BuiltRiver {
  def: RiverDef;
  segs: Seg[];
}

let built: BuiltRiver[] | null = null;
let exclPts: { x: number; z: number }[] | null = null;

function getBuilt(): BuiltRiver[] {
  if (built) return built;
  built = RIVERS.map((def) => {
    const pts = def.points.map(([lon, lat, w]) => {
      const g = latLonToGame(lon, lat);
      return { x: g.x, z: g.z, hw: (w ?? DEFAULT_WIDTH) / 2 };
    });
    const segs: Seg[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      segs.push({
        ax: a.x,
        az: a.z,
        bx: b.x,
        bz: b.z,
        wa: a.hw,
        wb: b.hw,
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minZ: Math.min(a.z, b.z),
        maxZ: Math.max(a.z, b.z),
      });
    }
    return { def, segs };
  });
  return built;
}

function getExcl(): { x: number; z: number }[] {
  if (!exclPts) {
    exclPts = STATION_PTS.map(([lon, lat]) => latLonToGame(lon, lat));
  }
  return exclPts;
}

function smooth01(k: number): number {
  const c = Math.min(1, Math.max(0, k));
  return c * c * (3 - 2 * c);
}

/**
 * Third terrain pass: carve river channels. Operates on row range
 * [z0, z1) so the async builder can slice it across frames; pass the full
 * grid for the synchronous build. Only lowers heights, only on dry land,
 * never inside station exclusion discs. Idempotent per cell.
 */
export function carveRivers(
  heights: Float32Array,
  paint: Uint8Array,
  inside: Uint8Array,
  res: number,
  cell: number,
  half: number,
  z0: number,
  z1: number,
): void {
  const rivers = getBuilt();
  const excl = getExcl();
  const maxReach = 60 + BANK_W + ALLUVIAL_W; // widest influence bound
  for (let iz = z0; iz < z1; iz++) {
    const wz = iz * cell - half;
    for (let ix = 0; ix < res; ix++) {
      const idx = iz * res + ix;
      if (inside[idx] !== 1) continue;
      const h = heights[idx];
      if (h <= 0.5) continue; // already water/beach — nothing to carve
      const wx = ix * cell - half;
      let bestD = Infinity;
      let bestHw = 0;
      for (const r of rivers) {
        for (const s of r.segs) {
          if (wx < s.minX - maxReach || wx > s.maxX + maxReach) continue;
          if (wz < s.minZ - maxReach || wz > s.maxZ + maxReach) continue;
          const abx = s.bx - s.ax;
          const abz = s.bz - s.az;
          const lenSq = abx * abx + abz * abz;
          let t = 0;
          if (lenSq > 0) {
            t = ((wx - s.ax) * abx + (wz - s.az) * abz) / lenSq;
            t = Math.min(1, Math.max(0, t));
          }
          const cx = s.ax + abx * t;
          const cz = s.az + abz * t;
          const d = Math.hypot(wx - cx, wz - cz);
          if (d < bestD) {
            bestD = d;
            bestHw = s.wa + (s.wb - s.wa) * t;
          }
        }
      }
      if (bestD > bestHw + BANK_W + ALLUVIAL_W) continue;
      // Station exclusion: tracks/platforms stay dry.
      let excluded = false;
      for (const e of excl) {
        const dx = wx - e.x;
        if (dx > EXCLUSION_R || dx < -EXCLUSION_R) continue;
        const dz = wz - e.z;
        if (dx * dx + dz * dz < EXCLUSION_R * EXCLUSION_R) {
          excluded = true;
          break;
        }
      }
      if (excluded) continue;
      if (bestD <= bestHw) {
        heights[idx] = Math.min(h, RIVER_BED_H);
        paint[idx] = 2; // sand bed (reads through shallows)
      } else if (bestD <= bestHw + BANK_W) {
        const k = smooth01((bestD - bestHw) / BANK_W);
        heights[idx] = Math.min(h, RIVER_BED_H + (h - RIVER_BED_H) * k);
        paint[idx] = 2; // sand banks
      } else {
        paint[idx] = 1; // alluvial tint ring
      }
    }
  }
}

/** Distance from a point to the nearest water edge (<=0 = in water). */
export function distToRiver(x: number, z: number): { d: number; id: string } | null {
  const rivers = getBuilt();
  let best: { d: number; id: string } | null = null;
  for (const r of rivers) {
    for (const s of r.segs) {
      const abx = s.bx - s.ax;
      const abz = s.bz - s.az;
      const lenSq = abx * abx + abz * abz;
      let t = 0;
      if (lenSq > 0) {
        t = ((x - s.ax) * abx + (z - s.az) * abz) / lenSq;
        t = Math.min(1, Math.max(0, t));
      }
      const cx = s.ax + abx * t;
      const cz = s.az + abz * t;
      const hw = s.wa + (s.wb - s.wa) * t;
      const d = Math.hypot(x - cx, z - cz) - hw;
      if (!best || d < best.d) best = { d, id: r.def.id };
    }
  }
  return best;
}

/** Sparse centerline polylines in game meters (for the 2D maps). */
let polylinesCache: { x: number; z: number }[][] | null = null;
export function riverPolylines(): { x: number; z: number }[][] {
  // Rivers are static after first build — never reallocate per map tick.
  if (polylinesCache) return polylinesCache;
  polylinesCache = getBuilt().map((r) =>
    r.segs.map((s) => ({ x: s.ax, z: s.az })).concat([
      {
        x: r.segs[r.segs.length - 1].bx,
        z: r.segs[r.segs.length - 1].bz,
      },
    ]),
  );
  return polylinesCache;
}

/**
 * River current at a point, m/s, pointing downstream (waypoints run
 * source→sea). Full speed mid-channel, fading to still water at the banks
 * (and zero outside) — swimmers get pushed, waders barely feel it.
 */
export function riverFlowAt(x: number, z: number): { dx: number; dz: number } {
  const rivers = getBuilt();
  let bestD = Infinity;
  let bestX = 0;
  let bestZ = 0;
  let bestHw = 0;
  for (const r of rivers) {
    for (const s of r.segs) {
      const abx = s.bx - s.ax;
      const abz = s.bz - s.az;
      const lenSq = abx * abx + abz * abz;
      if (lenSq <= 0) continue;
      const t = Math.min(1, Math.max(0, ((x - s.ax) * abx + (z - s.az) * abz) / lenSq));
      const d = Math.hypot(x - (s.ax + abx * t), z - (s.az + abz * t));
      if (d < bestD) {
        bestD = d;
        bestX = abx;
        bestZ = abz;
        bestHw = s.wa + (s.wb - s.wa) * t;
      }
    }
  }
  const span = bestHw + BANK_W;
  if (!isFinite(bestD) || bestD >= span || span <= 0) return { dx: 0, dz: 0 };
  const len = Math.hypot(bestX, bestZ);
  if (len <= 0) return { dx: 0, dz: 0 };
  const k = Math.max(0, 1 - bestD / span);
  const v = RIVER_FLOW_SPEED * k * k;
  return { dx: (bestX / len) * v, dz: (bestZ / len) * v };
}
