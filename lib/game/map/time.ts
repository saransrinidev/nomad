// Day/night time engine. 1 real minute = 1 game hour (full day = 24 min).
// Pure math, no Three.js — safe to import anywhere including headless tests.

export const START_TIME = 8; // 08:00 morning start
const HOURS_PER_REAL_SECOND = 1 / 60;

export function advanceTime(t: number, dtRealSeconds: number): number {
  return (t + dtRealSeconds * HOURS_PER_REAL_SECOND) % 24;
}

/** Sun elevation -1..1 (rises ~06:00, sets ~18:00). */
export function sunElevation(t: number): number {
  return Math.sin(((t - 6) / 12) * Math.PI);
}

/** 0 by day, 1 in full night. */
export function nightFactor(t: number): number {
  const el = sunElevation(t);
  return Math.min(1, Math.max(0, (0.12 - el) / 0.3));
}

export function sunDirection(t: number): [number, number, number] {
  const th = ((t - 6) / 12) * Math.PI;
  const v: [number, number, number] = [Math.cos(th), Math.sin(th), 0.28];
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function moonDirection(t: number): [number, number, number] {
  const th = ((t - 6) / 12) * Math.PI - Math.PI;
  const v: [number, number, number] = [Math.cos(th), Math.sin(th), 0.28];
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
}

export interface SkySample {
  top: string;
  horizon: string;
  fog: string;
  light: string; // active key light tint (warm sun / cool moon)
  sunI: number;
  moonI: number;
  hemiI: number;
  fogFar: number; // atmospheric density follows the clock
  exposure: number; // cinematic exposure follows the clock
  night: number;
}

interface SkyStop {
  h: number;
  top: string;
  horizon: string;
  fog: string;
  light: string;
  sunI: number;
  moonI: number;
  hemiI: number;
  fogFar: number;
  exposure: number;
}

// NOTE: fogFar is tuned for the 16x16 km world — day values reach several
// km so the far shore stays visible; nights stay murky on purpose.
const STOPS: SkyStop[] = [
  { h: 0, top: "#060a18", horizon: "#0d1526", fog: "#0d1526", light: "#9fb6ff", sunI: 0, moonI: 0.3, hemiI: 0.22, fogFar: 800, exposure: 0.9 },
  { h: 5, top: "#060a18", horizon: "#0d1526", fog: "#0d1526", light: "#9fb6ff", sunI: 0, moonI: 0.3, hemiI: 0.22, fogFar: 800, exposure: 0.9 },
  { h: 6, top: "#2c4a72", horizon: "#d98a5f", fog: "#c08a6a", light: "#ffb37a", sunI: 0.5, moonI: 0.12, hemiI: 0.4, fogFar: 1500, exposure: 1.0 },
  { h: 7, top: "#4a86c8", horizon: "#ffd9a8", fog: "#d9c2a8", light: "#ffd9a8", sunI: 1.1, moonI: 0, hemiI: 0.55, fogFar: 2200, exposure: 1.02 },
  { h: 7.5, top: "#3f8fd2", horizon: "#bfe3f2", fog: "#bfe3f2", light: "#fff2d9", sunI: 1.5, moonI: 0, hemiI: 0.55, fogFar: 3000, exposure: 1.05 },
  { h: 12, top: "#2f7fc9", horizon: "#bde0f2", fog: "#bfe3f2", light: "#fff6e8", sunI: 1.7, moonI: 0, hemiI: 0.55, fogFar: 3400, exposure: 1.05 },
  { h: 15, top: "#3580c4", horizon: "#c8dcea", fog: "#c2d4e2", light: "#ffedd0", sunI: 1.6, moonI: 0, hemiI: 0.55, fogFar: 3200, exposure: 1.05 },
  { h: 16.5, top: "#3573b8", horizon: "#c9d8e8", fog: "#c2d4e2", light: "#fff0d0", sunI: 1.5, moonI: 0, hemiI: 0.55, fogFar: 3000, exposure: 1.05 },
  { h: 17.8, top: "#3a5a94", horizon: "#f0a868", fog: "#d99878", light: "#ffab66", sunI: 0.9, moonI: 0, hemiI: 0.5, fogFar: 2400, exposure: 1.08 },
  { h: 18.8, top: "#1c2c52", horizon: "#c65f52", fog: "#8a5a5e", light: "#ff8a5a", sunI: 0.25, moonI: 0.12, hemiI: 0.35, fogFar: 1500, exposure: 1.0 },
  { h: 20, top: "#060a18", horizon: "#101a30", fog: "#0d1526", light: "#9fb6ff", sunI: 0, moonI: 0.3, hemiI: 0.25, fogFar: 900, exposure: 0.92 },
  { h: 24, top: "#060a18", horizon: "#0d1526", fog: "#0d1526", light: "#9fb6ff", sunI: 0, moonI: 0.3, hemiI: 0.22, fogFar: 800, exposure: 0.9 },
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(a: string, b: string, k: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * k));
  return `#${((c[0] << 16) | (c[1] << 8) | c[2]).toString(16).padStart(6, "0")}`;
}

function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}

export function sampleSky(t: number): SkySample {
  const tt = ((t % 24) + 24) % 24;
  let i = 0;
  while (i < STOPS.length - 2 && STOPS[i + 1].h <= tt) i++;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const k = Math.min(1, Math.max(0, (tt - a.h) / (b.h - a.h)));
  return {
    top: mixHex(a.top, b.top, k),
    horizon: mixHex(a.horizon, b.horizon, k),
    fog: mixHex(a.fog, b.fog, k),
    light: mixHex(a.light, b.light, k),
    sunI: lerp(a.sunI, b.sunI, k),
    moonI: lerp(a.moonI, b.moonI, k),
    hemiI: lerp(a.hemiI, b.hemiI, k),
    fogFar: lerp(a.fogFar, b.fogFar, k),
    exposure: lerp(a.exposure, b.exposure, k),
    night: nightFactor(tt),
  };
}

/** "08:00" style label. */
export function formatTime(t: number): string {
  const tt = ((t % 24) + 24) % 24;
  const hh = Math.floor(tt);
  const mm = Math.floor((tt - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
