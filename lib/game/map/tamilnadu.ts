// Tamil Nadu outline: clean outer ring tracing the STATE border only
// (clockwise from Pulicat → AP border west → Western Ghats south →
// Kanyakumari tip → east coast north back to Pulicat). ~85 pts.
// Interior district edges are deliberately excluded so point-in-polygon
// stays a simple ring. [lon, lat] pairs.
//
// Axis convention (matches geo.ts): +X = east, -Z = north.

export type LonLat = [number, number];

export const TN_OUTLINE: LonLat[] = [
  // --- North border with Andhra Pradesh (east → west) ---
  [80.3, 13.55],
  [79.97, 13.43],
  [79.73, 13.3],
  [79.45, 13.24],
  [79.2, 13.18],
  [78.95, 13.05],
  [78.7, 12.98],
  [78.45, 12.9],
  [78.2, 12.86],
  [77.99, 12.85],
  [77.85, 12.78],
  [77.65, 12.7],
  [77.5, 12.6],
  [77.4, 12.45],
  // --- West border with Karnataka / Kerala (north → south) ---
  [77.55, 12.2],
  [77.6, 12.0],
  [77.5, 11.9],
  [77.3, 11.75],
  [77.0, 11.74],
  [76.82, 11.61],
  [76.57, 11.62],
  [76.46, 11.66],
  [76.24, 11.53],
  [76.28, 11.48],
  [76.37, 11.46],
  [76.5, 11.21],
  [76.66, 11.05],
  [76.74, 11.0],
  [76.84, 10.87],
  [76.82, 10.6],
  [76.85, 10.4],
  [76.95, 10.25],
  [77.1, 10.05],
  [77.2, 9.9],
  [77.15, 9.6],
  [77.22, 9.4],
  [77.24, 9.15],
  [77.2, 8.9],
  [77.25, 8.62],
  [77.1, 8.5],
  [77.15, 8.29],
  [77.25, 8.17],
  [77.33, 8.13],
  // --- Kanyakumari tip ---
  [77.55, 8.07],
  // --- East coast (south → north) ---
  [78.06, 8.41],
  [78.14, 8.61],
  [78.23, 8.81],
  [78.27, 9.0],
  [78.6, 9.14],
  [78.9, 9.25],
  [79.16, 9.28],
  [79.31, 9.33],
  [79.55, 9.6],
  [79.68, 9.95],
  [79.72, 10.1],
  [79.85, 10.28],
  [79.88, 10.6],
  [79.85, 11.0],
  [79.81, 11.42],
  [79.8, 11.77],
  [79.85, 11.99],
  [79.97, 12.23],
  [80.05, 12.33],
  [80.14, 12.41],
  [80.17, 12.54],
  [80.18, 12.7],
  [80.22, 12.8],
  [80.249, 12.857],
  [80.259, 12.937],
  [80.3, 13.14],
  [80.3, 13.43],
];

export const TN_BBOX = {
  minLon: 76.24,
  maxLon: 80.36,
  minLat: 8.07,
  maxLat: 13.6,
};

const METERS_PER_DEG_LAT = 111320;
// Longitude scale at TN mid-latitude (~10.8N).
const TN_MID_LAT = 10.8;
const METERS_PER_DEG_LON =
  METERS_PER_DEG_LAT * Math.cos((TN_MID_LAT * Math.PI) / 180);

const CENTER_LON = (TN_BBOX.minLon + TN_BBOX.maxLon) / 2;
const CENTER_LAT = (TN_BBOX.minLat + TN_BBOX.maxLat) / 2;

/** Projection center (lon/lat of game 0,0). Single source of truth for geo. */
export const TN_CENTER = { lon: CENTER_LON, lat: CENTER_LAT };

const SPAN_XM = (TN_BBOX.maxLon - TN_BBOX.minLon) * METERS_PER_DEG_LON;
const SPAN_ZM = (TN_BBOX.maxLat - TN_BBOX.minLat) * METERS_PER_DEG_LAT;

/** Margin so the KK tip / Pulicat never clip the terrain edge. */
const TN_MAP_MARGIN = 0.94;

// Filled by setWorldSize() before first use; defaults to 16 km.
let worldSize = 16000;
let worldScale = ((worldSize * TN_MAP_MARGIN) / Math.max(SPAN_XM, SPAN_ZM));

export function setTNWorldSize(sizeMeters: number) {
  worldSize = sizeMeters;
  worldScale = (worldSize * TN_MAP_MARGIN) / Math.max(SPAN_XM, SPAN_ZM);
}

/** Game meters per real meter (includes the edge margin). For geo sync. */
export function getTNWorldScale(): number {
  return worldScale;
}

/** lon/lat → game XZ (meters). +X east, +Z south (−Z north). */
export function latLonToGame(lon: number, lat: number): { x: number; z: number } {
  const mx = (lon - CENTER_LON) * METERS_PER_DEG_LON;
  const mz = -(lat - CENTER_LAT) * METERS_PER_DEG_LAT;
  return { x: mx * worldScale, z: mz * worldScale };
}

/** game XZ → lon/lat. */
export function gameToLatLon(x: number, z: number): { lon: number; lat: number } {
  const mx = x / worldScale;
  const mz = z / worldScale;
  return {
    lon: CENTER_LON + mx / METERS_PER_DEG_LON,
    lat: CENTER_LAT - mz / METERS_PER_DEG_LAT,
  };
}

/** Pre-projected outline in game meters (recomputed if world size changes). */
let gameOutlineCache: { x: number; z: number }[] | null = null;
let gameOutlineSize = 0;
export function getTNGameOutline(): { x: number; z: number }[] {
  if (gameOutlineCache && gameOutlineSize === worldSize) return gameOutlineCache;
  gameOutlineCache = TN_OUTLINE.map(([lon, lat]) => latLonToGame(lon, lat));
  gameOutlineSize = worldSize;
  return gameOutlineCache;
}

// Bounding box of outline in game meters (for fast reject).
let outlineBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null =
  null;
function getOutlineBounds() {
  if (outlineBounds && gameOutlineSize === worldSize) return outlineBounds;
  const pts = getTNGameOutline();
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  outlineBounds = { minX, maxX, minZ, maxZ };
  return outlineBounds;
}

/** Even-odd point-in-polygon on game XZ coords. */
export function isInsideTN(x: number, z: number): boolean {
  const b = getOutlineBounds();
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
  const pts = getTNGameOutline();
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x,
      zi = pts[i].z;
    const xj = pts[j].x,
      zj = pts[j].z;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Anchor for the lat/long readout: TN center (roughly Karur). */
export const TN_GEO_ANCHOR = { lat: 10.9, lon: 78.2 };
