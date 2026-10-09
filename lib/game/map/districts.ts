// District lookup for the Tamil Nadu plain.
//
// Two-tier system:
// 1. Exact: if the user drops their district FeatureCollection at
//    /maps/tn-districts.geojson (public/maps/tn-districts.geojson), it is
//    fetched once, projected to game meters, and used for point-in-polygon
//    tests (Polygon + MultiPolygon with holes supported). Property keys
//    tried: district, DISTRICT, name, Name.
// 2. Fallback: coarse per-district lon/lat boxes (38 districts) so the toast
//    + map label work with zero setup. Smallest-area box wins on overlap.

"use client";

import { useEffect, useState, type RefObject } from "react";
import { gameToLatLon, isInsideTN, latLonToGame } from "./tamilnadu";
import { getFocusPoint, type GameWorld } from "../state";

export const DISTRICT_GEOJSON_URL = "/maps/tn-districts.geojson";

interface ProjectedRing {
  x: number;
  z: number;
}

interface DistrictPoly {
  name: string;
  /** Each polygon: first ring is outer, rest are holes. */
  polys: { outer: ProjectedRing[]; holes: ProjectedRing[][] }[];
}

let loaded: DistrictPoly[] | null = null;
let loadAttempted = false;

function ringContains(ring: ProjectedRing[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const zi = ring[i].z;
    const xj = ring[j].x;
    const zj = ring[j].z;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function stride<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  const out: T[] = [];
  for (let i = 0; i < arr.length; i += step) out.push(arr[i]);
  return out;
}

type LonLatRing = [number, number][];

function projectRing(ring: LonLatRing): ProjectedRing[] {
  return ring.map(([lon, lat]) => latLonToGame(lon, lat));
}

/** Parse a FeatureCollection into projected district polys. */
export function parseDistrictGeoJSON(fc: unknown): DistrictPoly[] {
  const out: DistrictPoly[] = [];
  if (!fc || typeof fc !== "object") return out;
  const features = (fc as { features?: unknown }).features;
  if (!Array.isArray(features)) return out;
  for (const f of features) {
    if (!f || typeof f !== "object") continue;
    const props = (f as { properties?: Record<string, unknown> }).properties ?? {};
    const rawName =
      props.district ?? props.DISTRICT ?? props.name ?? props.Name ?? props.dt_name;
    if (typeof rawName !== "string" || rawName.trim() === "") continue;
    const geom = (f as { geometry?: { type?: string; coordinates?: unknown } }).geometry;
    if (!geom || typeof geom.type !== "string") continue;
    const polys: DistrictPoly["polys"] = [];
    const pushPolygon = (coords: unknown) => {
      if (!Array.isArray(coords) || coords.length === 0) return;
      const rings = (coords as LonLatRing[]).filter(
        (r) => Array.isArray(r) && r.length >= 4,
      );
      if (rings.length === 0) return;
      polys.push({
        outer: projectRing(stride(rings[0], 160)),
        holes: rings.slice(1).map((h) => projectRing(stride(h, 80))),
      });
    };
    if (geom.type === "Polygon") {
      pushPolygon(geom.coordinates);
    } else if (geom.type === "MultiPolygon") {
      if (Array.isArray(geom.coordinates)) {
        for (const p of geom.coordinates as unknown[]) pushPolygon(p);
      }
    }
    if (polys.length > 0) out.push({ name: rawName.trim(), polys });
  }
  return out;
}

/** Fetch + cache the GeoJSON. Never throws; resolves false when unavailable. */
export async function ensureDistrictsLoaded(): Promise<boolean> {
  if (loaded) return true;
  if (loadAttempted) return false;
  loadAttempted = true;
  try {
    const res = await fetch(DISTRICT_GEOJSON_URL);
    if (!res.ok) return false;
    const fc = await res.json();
    const parsed = parseDistrictGeoJSON(fc);
    if (parsed.length === 0) return false;
    loaded = parsed;
    return true;
  } catch {
    return false;
  }
}

export function districtsReady(): boolean {
  return loaded !== null;
}

/** Outer rings of every loaded district, for canvas boundary strokes. */
export function getDistrictRings(): ProjectedRing[][] {
  if (!loaded) return [];
  const out: ProjectedRing[][] = [];
  for (const d of loaded) {
    for (const p of d.polys) out.push(p.outer);
  }
  return out;
}

/** Centroid label anchors of every loaded district. */
export function getDistrictLabelPoints(): { name: string; x: number; z: number }[] {
  if (!loaded) return [];
  return loaded.map((d) => {
    const ring = d.polys[0].outer;
    let x = 0;
    let z = 0;
    for (const p of ring) {
      x += p.x;
      z += p.z;
    }
    return { name: d.name, x: x / ring.length, z: z / ring.length };
  });
}

/** Fallback box corners projected to game meters (for map dividers). */
export function getFallbackRings(): ProjectedRing[][] {
  return FALLBACK_DISTRICTS.map((b) => {
    const corners: [number, number][] = [
      [b.minLon, b.minLat],
      [b.maxLon, b.minLat],
      [b.maxLon, b.maxLat],
      [b.minLon, b.maxLat],
    ];
    return corners.map(([lon, lat]) => latLonToGame(lon, lat));
  });
}

/** Fallback box centers (for map labels). */
export function getFallbackLabelPoints(): { name: string; x: number; z: number }[] {
  return FALLBACK_DISTRICTS.map((b) => {
    const p = latLonToGame((b.minLon + b.maxLon) / 2, (b.minLat + b.maxLat) / 2);
    return { name: b.name, x: p.x, z: p.z };
  });
}

export interface MapDivisions {
  rings: ProjectedRing[][];
  labels: { name: string; x: number; z: number }[];
  /** True when rings are exact GeoJSON borders (vs coarse fallback boxes). */
  exact: boolean;
}

/** Rings + labels for the maps: exact GeoJSON when loaded, else fallback. */
export function getMapDivisions(): MapDivisions {
  if (loaded) {
    return { rings: getDistrictRings(), labels: getDistrictLabelPoints(), exact: true };
  }
  return { rings: getFallbackRings(), labels: getFallbackLabelPoints(), exact: false };
}

// --- Fallback: coarse lon/lat boxes (half-open intervals) ---

interface DistrictBox {
  name: string;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

const FALLBACK_DISTRICTS: DistrictBox[] = [
  { name: "Thiruvallur", minLon: 79.3, maxLon: 80.36, minLat: 13.0, maxLat: 13.6 },
  { name: "Chennai", minLon: 80.12, maxLon: 80.31, minLat: 12.85, maxLat: 13.16 },
  { name: "Kancheepuram", minLon: 79.68, maxLon: 80.1, minLat: 12.7, maxLat: 13.05 },
  { name: "Chengalpattu", minLon: 79.7, maxLon: 80.26, minLat: 12.3, maxLat: 12.92 },
  { name: "Vellore", minLon: 78.85, maxLon: 79.3, minLat: 12.68, maxLat: 13.02 },
  { name: "Ranipet", minLon: 79.2, maxLon: 79.75, minLat: 12.75, maxLat: 13.22 },
  { name: "Tirupathur", minLon: 78.4, maxLon: 78.95, minLat: 12.25, maxLat: 12.95 },
  { name: "Tiruvannamalai", minLon: 78.6, maxLon: 79.5, minLat: 12.0, maxLat: 12.7 },
  { name: "Krishnagiri", minLon: 77.45, maxLon: 78.65, minLat: 11.82, maxLat: 12.9 },
  { name: "Dharmapuri", minLon: 77.7, maxLon: 78.55, minLat: 11.88, maxLat: 12.45 },
  { name: "Salem", minLon: 77.65, maxLon: 78.95, minLat: 11.45, maxLat: 11.98 },
  { name: "Namakkal", minLon: 78.15, maxLon: 78.55, minLat: 11.0, maxLat: 11.62 },
  { name: "Erode", minLon: 77.0, maxLon: 78.0, minLat: 11.0, maxLat: 11.92 },
  { name: "Tiruppur", minLon: 77.1, maxLon: 77.95, minLat: 10.55, maxLat: 11.32 },
  { name: "Coimbatore", minLon: 76.65, maxLon: 77.3, minLat: 10.55, maxLat: 11.42 },
  { name: "Nilgiris", minLon: 76.24, maxLon: 77.05, minLat: 11.2, maxLat: 11.72 },
  { name: "Kallakurichi", minLon: 78.65, maxLon: 79.35, minLat: 11.45, maxLat: 12.05 },
  { name: "Viluppuram", minLon: 79.15, maxLon: 79.98, minLat: 11.85, maxLat: 12.32 },
  { name: "Cuddalore", minLon: 79.05, maxLon: 79.9, minLat: 11.3, maxLat: 11.95 },
  { name: "Perambalur", minLon: 78.6, maxLon: 79.15, minLat: 11.22, maxLat: 11.55 },
  { name: "Ariyalur", minLon: 79.0, maxLon: 79.55, minLat: 10.92, maxLat: 11.4 },
  { name: "Tiruchirappalli", minLon: 78.15, maxLon: 79.05, minLat: 10.55, maxLat: 11.52 },
  { name: "Karur", minLon: 77.75, maxLon: 78.55, minLat: 10.65, maxLat: 11.1 },
  { name: "Thanjavur", minLon: 78.85, maxLon: 79.55, minLat: 10.1, maxLat: 11.05 },
  { name: "Tiruvarur", minLon: 79.3, maxLon: 79.9, minLat: 10.32, maxLat: 10.95 },
  { name: "Nagapattinam", minLon: 79.65, maxLon: 79.9, minLat: 10.25, maxLat: 10.95 },
  { name: "Mayiladuthurai", minLon: 79.4, maxLon: 79.9, minLat: 10.85, maxLat: 11.35 },
  { name: "Pudukkottai", minLon: 78.45, maxLon: 79.25, minLat: 9.85, maxLat: 10.72 },
  { name: "Sivaganga", minLon: 78.25, maxLon: 78.95, minLat: 9.55, maxLat: 10.62 },
  { name: "Madurai", minLon: 77.95, maxLon: 78.35, minLat: 9.65, maxLat: 10.35 },
  { name: "Theni", minLon: 77.15, maxLon: 77.62, minLat: 9.55, maxLat: 10.25 },
  { name: "Dindigul", minLon: 77.35, maxLon: 78.35, minLat: 10.05, maxLat: 10.75 },
  { name: "Virudhunagar", minLon: 77.35, maxLon: 78.45, minLat: 9.2, maxLat: 9.95 },
  { name: "Tirunelveli", minLon: 77.5, maxLon: 78.0, minLat: 8.35, maxLat: 9.12 },
  { name: "Tenkasi", minLon: 77.15, maxLon: 77.62, minLat: 8.55, maxLat: 9.55 },
  { name: "Thoothukkudi", minLon: 77.7, maxLon: 78.45, minLat: 8.35, maxLat: 9.4 },
  { name: "Ramanathapuram", minLon: 78.25, maxLon: 79.35, minLat: 9.1, maxLat: 9.95 },
  { name: "Kanyakumari", minLon: 77.1, maxLon: 77.65, minLat: 8.05, maxLat: 8.55 },
];

function fallbackDistrictAt(x: number, z: number): string | null {
  // Boxes are stored in lon/lat, so invert the game transform first.
  const { lon, lat } = gameToLatLon(x, z);
  let best: string | null = null;
  let bestArea = Infinity;
  for (const b of FALLBACK_DISTRICTS) {
    if (lon >= b.minLon && lon < b.maxLon && lat >= b.minLat && lat < b.maxLat) {
      const area = (b.maxLon - b.minLon) * (b.maxLat - b.minLat);
      if (area < bestArea) {
        bestArea = area;
        best = b.name;
      }
    }
  }
  return best;
}

/**
 * District name at game (x, z), or null when outside Tamil Nadu.
 * Inside TN but unmatched (tiny gaps) → "Tamil Nadu".
 */
export function districtAt(x: number, z: number): string | null {
  if (!isInsideTN(x, z)) return null;
  if (loaded) {
    for (const d of loaded) {
      for (const p of d.polys) {
        if (
          ringContains(p.outer, x, z) &&
          !p.holes.some((h) => ringContains(h, x, z))
        ) {
          return d.name;
        }
      }
    }
    return "Tamil Nadu";
  }
  return fallbackDistrictAt(x, z) ?? "Tamil Nadu";
}

/** Poll the focus point (~4 Hz) and mirror the current district to React. */
export function useCurrentDistrict(
  worldRef: RefObject<GameWorld>,
): string | null {
  const [district, setDistrict] = useState<string | null>(null);
  useEffect(() => {
    void ensureDistrictsLoaded();
    const id = window.setInterval(() => {
      const w = worldRef.current;
      if (!w) return;
      const f = getFocusPoint(w);
      const d = districtAt(f.x, f.z);
      setDistrict((prev) => (prev === d ? prev : d));
    }, 250);
    return () => window.clearInterval(id);
  }, [worldRef]);
  return district;
}
