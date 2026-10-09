// Tamil Nadu railways: one shuttle consist per line, all-stop dwelling.
// Lines are data (stations + dwell config); each line builds a chained
// quadratic curve through its stations with inland-biased bows. Pure data +
// math (no React/Three at runtime, except a type-only GameWorld for the
// sim). Meshes live in components/game/{Railway,Train}.tsx.

import { latLonToGame } from "./tamilnadu";
import { groundHeight } from "./terrain";
import type { GameWorld } from "../state";

export const TRAIN_SPEED = 25; // m/s (~90 km/h feel at world scale)

export const LOCO_LEN = 14;
export const COACH_LEN = 12;
export const COACH_GAP = 1.2;
export const LOCO_GAP = 1.5;
/** Nose-to-tail length of a loco + 4-coach consist. */
export const TRAIN_LENGTH =
  LOCO_LEN + LOCO_GAP + 4 * COACH_LEN + 3 * COACH_GAP;

export function consistLength(coachCount: number): number {
  return LOCO_LEN + LOCO_GAP + coachCount * COACH_LEN + (coachCount - 1) * COACH_GAP;
}

export interface StationDef {
  name: string;
  short: string;
  lon: number;
  lat: number;
}

export interface LineDef {
  id: string;
  /** Map line color. */
  color: string;
  dwell: number; // seconds stopped at every station
  coachCount: number;
  stations: StationDef[];
}

export const LINES: LineDef[] = [
  {
    id: "chennai",
    color: "#1f5fa8",
    dwell: 60,
    coachCount: 6,
    stations: [
      { name: "Chennai Central", short: "CHENNAI", lon: 80.2707, lat: 13.0827 },
      { name: "Chengalpattu Junction", short: "CHENGALPATTU", lon: 79.9838, lat: 12.6936 },
      { name: "Villupuram Junction", short: "VILLUPURAM", lon: 79.4917, lat: 11.9401 },
      { name: "Cuddalore Port Junction", short: "CUDDALORE PORT", lon: 79.768, lat: 11.754 },
      { name: "Chidambaram", short: "CHIDAMBARAM", lon: 79.6936, lat: 11.3997 },
      { name: "Mayiladuthurai Junction", short: "MAYILADUTHURAI", lon: 79.6528, lat: 11.1012 },
      { name: "Kumbakonam", short: "KUMBAKONAM", lon: 79.3846, lat: 10.9617 },
      { name: "Thanjavur Junction", short: "THANJAVUR", lon: 79.1383, lat: 10.7852 },
      { name: "Tiruchchirappalli Junction", short: "TRICHY JN", lon: 78.6856, lat: 10.7905 },
    ],
  },
];

export interface TrackPoint {
  x: number;
  z: number;
  /** Tangent yaw (game convention: forward = (sin yaw, cos yaw)). */
  yaw: number;
}

export interface Station extends StationDef {
  x: number;
  z: number;
  yaw: number;
  /** Arc distance along the line. */
  s: number;
}

export interface BuiltLine {
  def: LineDef;
  stations: Station[];
  /** Dense samples along the chained curve (incl. buffer stubs). */
  path: { x: number; z: number }[];
  /** Cumulative length at each sample. */
  cum: number[];
  /** Full path length (buffers included). */
  length: number;
  /** Head-travel bounds: first/last station arc positions. */
  headMin: number;
  headMax: number;
}

const CURVE_BEND = 0.06; // lateral bow as a fraction of leg distance
/** Straight buffer stubs past each terminus so dwelling/departing consists
 * (≤93.5 m) never clamp onto the path ends. */
const BUFFER_M = 120;

function quadPoint(
  ax: number,
  az: number,
  cx: number,
  cz: number,
  bx: number,
  bz: number,
  t: number,
): { x: number; z: number } {
  const u = 1 - t;
  return {
    x: u * u * ax + 2 * u * t * cx + t * t * bx,
    z: u * u * az + 2 * u * t * cz + t * t * bz,
  };
}

function buildLine(def: LineDef): BuiltLine {
  const pts = def.stations.map((s) => latLonToGame(s.lon, s.lat));
  const path: { x: number; z: number }[] = [];
  const cum: number[] = [0];
  const push = (p: { x: number; z: number }) => {
    path.push(p);
    if (path.length > 1) {
      const q = path[path.length - 2];
      cum.push(cum[cum.length - 1] + Math.hypot(p.x - q.x, p.z - q.z));
    }
  };
  const jointS: number[] = [0];
  for (let leg = 0; leg < pts.length - 1; leg++) {
    const a = pts[leg];
    const b = pts[leg + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    // Control point bowed sideways; pick the side closer to the state
    // center (game origin) so curves stay inland, off the sea.
    const nx = -dz / dist;
    const nz = dx / dist;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const bow = dist * CURVE_BEND;
    const c1x = mx + nx * bow;
    const c1z = mz + nz * bow;
    const c2x = mx - nx * bow;
    const c2z = mz - nz * bow;
    const inland1 = c1x * c1x + c1z * c1z < mx * mx + mz * mz;
    const cx = inland1 ? c1x : c2x;
    const cz = inland1 ? c1z : c2z;
    const samples = Math.min(256, Math.max(24, Math.round(dist / 13)));
    for (let i = leg === 0 ? 0 : 1; i <= samples; i++) {
      push(quadPoint(a.x, a.z, cx, cz, b.x, b.z, i / samples));
    }
    jointS.push(cum[cum.length - 1]);
  }
  const length = cum[cum.length - 1];
  // Buffer stubs: straight extensions past both ends along the end
  // tangents, so car offsets trailing past a terminus stay on the path.
  const t0x = path[1].x - path[0].x;
  const t0z = path[1].z - path[0].z;
  const t0l = Math.hypot(t0x, t0z);
  const ux0 = t0x / t0l;
  const uz0 = t0z / t0l;
  const n1 = path.length - 1;
  const t1x = path[n1].x - path[n1 - 1].x;
  const t1z = path[n1].z - path[n1 - 1].z;
  const t1l = Math.hypot(t1x, t1z);
  const ux1 = t1x / t1l;
  const uz1 = t1z / t1l;
  const STEPS = 9;
  const pre: { x: number; z: number }[] = [];
  for (let k = STEPS; k >= 1; k--) {
    pre.push({ x: path[0].x - ux0 * ((k / STEPS) * BUFFER_M), z: path[0].z - uz0 * ((k / STEPS) * BUFFER_M) });
  }
  const post: { x: number; z: number }[] = [];
  for (let k = 1; k <= STEPS; k++) {
    post.push({ x: path[n1].x + ux1 * ((k / STEPS) * BUFFER_M), z: path[n1].z + uz1 * ((k / STEPS) * BUFFER_M) });
  }
  const full = [...pre, ...path, ...post];
  const fullCum: number[] = [0];
  for (let i = 1; i < full.length; i++) {
    fullCum.push(fullCum[i - 1] + Math.hypot(full[i].x - full[i - 1].x, full[i].z - full[i - 1].z));
  }
  // Base joint arc positions shift by the prefix buffer length.
  const shift = fullCum[pre.length];
  const stations: Station[] = def.stations.map((s, i) => {
    const pose = trackPointAtLength(full, fullCum, fullCum[fullCum.length - 1], shift + jointS[i]);
    return { ...s, x: pose.x, z: pose.z, yaw: pose.yaw, s: shift + jointS[i] };
  });
  const fullLen = fullCum[fullCum.length - 1];
  return {
    def,
    stations,
    path: full,
    cum: fullCum,
    length: fullLen,
    headMin: shift,
    headMax: shift + length,
  };
}

function trackPointAtLength(
  path: { x: number; z: number }[],
  cum: number[],
  length: number,
  s: number,
): TrackPoint {
  const sc = Math.min(length, Math.max(0, s));
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < sc) i++;
  const s0 = cum[i];
  const s1 = cum[i + 1];
  const k = s1 > s0 ? (sc - s0) / (s1 - s0) : 0;
  const p0 = path[i];
  const p1 = path[i + 1];
  const x = p0.x + (p1.x - p0.x) * k;
  const z = p0.z + (p1.z - p0.z) * k;
  const tx = p1.x - p0.x;
  const tz = p1.z - p0.z;
  return { x, z, yaw: Math.atan2(tx, tz) };
}

const lineCache = new Map<string, BuiltLine>();

export function getLine(id: string): BuiltLine {
  let line = lineCache.get(id);
  if (!line) {
    const def = LINES.find((d) => d.id === id);
    if (!def) throw new Error(`unknown railway line: ${id}`);
    line = buildLine(def);
    lineCache.set(id, line);
  }
  return line;
}

export function getLines(): BuiltLine[] {
  return LINES.map((d) => getLine(d.id));
}

/** Pose at arc distance s on a line (clamped to the track). */
export function trackPointAt(lineId: string, s: number): TrackPoint {
  const r = getLine(lineId);
  return trackPointAtLength(r.path, r.cum, r.length, s);
}

/** Center pose of every car (loco first) given head distance + direction.
 * Cars trail behind the direction of travel; facing is fixed to the track
 * tangent (push-pull operation), so consists never snap-rotate and, with
 * the buffer stubs, offsets never clamp. */
export function trainCarCenters(
  lineId: string,
  headS: number,
  dir: 1 | -1,
): { x: number; z: number; yaw: number }[] {
  const r = getLine(lineId);
  const n = r.def.coachCount;
  const at = (s: number) => {
    const p = trackPointAtLength(r.path, r.cum, r.length, s);
    return { x: p.x, z: p.z, yaw: p.yaw };
  };
  const out = [at(headS - dir * (LOCO_LEN / 2))];
  for (let i = 0; i < n; i++) {
    out.push(at(headS - dir * (LOCO_LEN + LOCO_GAP + COACH_LEN / 2 + i * (COACH_LEN + COACH_GAP))));
  }
  return out;
}

// --- Multi-train shuttle simulation (runs in Train.tsx useFrame) ---

export interface TrainSimState {
  line: string;
  s: number;
  dir: 1 | -1;
  wait: number;
  x: number;
  z: number;
  angle: number;
}

export function initialTrainState(): TrainSimState[] {
  return LINES.map((d) => {
    const r = getLine(d.id);
    return { line: d.id, s: r.headMin, dir: 1 as const, wait: 2, x: 0, z: 0, angle: 0 };
  });
}

interface TrainSegment {
  hx: number;
  hz: number;
  tx: number;
  tz: number;
}

const segments = new Map<string, TrainSegment>();
const liveCars = new Map<string, { x: number; z: number; yaw: number }[]>();
const prevLiveCars = new Map<string, { x: number; z: number; yaw: number }[]>();
const stoppedLines = new Set<string>();

function stepTrain(t: TrainSimState, dt: number): void {
  const r = getLine(t.line);
  if (t.wait > 0) {
    t.wait = Math.max(0, t.wait - dt);
  } else {
    const prev = t.s;
    t.s += t.dir * TRAIN_SPEED * dt;
    // Halt at any station crossed this step (termini also flip direction).
    for (let i = 0; i < r.stations.length; i++) {
      const ss = r.stations[i].s;
      const crossed =
        t.dir > 0 ? prev < ss && t.s >= ss : prev > ss && t.s <= ss;
      if (crossed) {
        t.s = ss;
        t.wait = r.def.dwell;
        if (i === 0) t.dir = 1;
        else if (i === r.stations.length - 1) t.dir = -1;
        break;
      }
    }
    if (t.s >= r.headMax) {
      t.s = r.headMax;
      t.dir = -1;
      t.wait = r.def.dwell;
    } else if (t.s <= r.headMin) {
      t.s = r.headMin;
      t.dir = 1;
      t.wait = r.def.dwell;
    }
  }
  const head = trackPointAtLength(r.path, r.cum, r.length, t.s);
  t.x = head.x;
  t.z = head.z;
  t.angle = head.yaw + (t.dir < 0 ? Math.PI : 0);
  const cars = trainCarCenters(t.line, t.s, t.dir);
  const prev = liveCars.get(t.line);
  if (prev) prevLiveCars.set(t.line, prev);
  liveCars.set(t.line, cars);
  const tailS = Math.min(r.length, Math.max(0, t.s - t.dir * consistLength(r.def.coachCount)));
  const tail = trackPointAtLength(r.path, r.cum, r.length, tailS);
  segments.set(t.line, { hx: head.x, hz: head.z, tx: tail.x, tz: tail.z });
}

export function updateTrains(world: GameWorld, dt: number): void {
  stoppedLines.clear();
  for (const t of world.trains) {
    stepTrain(t, dt);
    if (t.wait > 0) stoppedLines.add(t.line);
  }
}

/** Live car poses for boarding/pose math (empty until the sim ticks). */
export function getLiveCars(lineId: string): { x: number; z: number; yaw: number }[] {
  return liveCars.get(lineId) ?? [];
}

/** Coach shell half-width (cars are 4 m wide). */
export const TRAIN_HALF_W = 2.0;
/** Doorway clear half-width; gaps centered at ±DOOR_AT along each coach. */
export const DOOR_AT = 4.5;
export const DOOR_HALF = 0.9;
/** Bridge plates extend this far past the wall at doorways. */
export const BRIDGE_REACH = 0.7;

/** World point → car-local coords (lx lateral, lz along travel). */
export function carLocal(
  c: { x: number; z: number; yaw: number },
  x: number,
  z: number,
): { lx: number; lz: number } {
  const dx = x - c.x;
  const dz = z - c.z;
  return {
    lx: Math.cos(c.yaw) * dx - Math.sin(c.yaw) * dz,
    lz: Math.sin(c.yaw) * dx + Math.cos(c.yaw) * dz,
  };
}

function inDoorBand(lz: number, pad: number): boolean {
  return Math.abs(Math.abs(lz) - DOOR_AT) < DOOR_HALF + pad;
}

/**
 * Coach wall collision with physical doorways. Side walls push out except
 * at the doorway bands while the line is stopped (doors "open" only at
 * stations); end walls + loco are always solid. Replaces the old capsule.
 */
export function collideTrain(
  x: number,
  z: number,
  radius: number,
): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (const [lineId, cars] of liveCars) {
    const stopped = stoppedLines.has(lineId);
    const line = getLine(lineId);
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      const halfLen = (i === 0 ? LOCO_LEN : COACH_LEN) / 2;
      const { lx, lz } = carLocal(c, px, pz);
      const alx = Math.abs(lx);
      const alz = Math.abs(lz);
      if (alx > TRAIN_HALF_W + radius || alz > halfLen + radius) continue;
      const doorsOpen = stopped && i > 0 && inDoorBand(lz, radius * 0.5);
      // Side walls (skipped at open doorways so players walk through).
      const sidePen = TRAIN_HALF_W + radius - alx;
      const endPen = halfLen + radius - alz;
      if (!doorsOpen && sidePen > 0 && sidePen <= endPen && alz < halfLen + radius) {
        const s = lx >= 0 ? 1 : -1;
        const rx = Math.cos(c.yaw);
        const rz = -Math.sin(c.yaw);
        px = c.x + rx * s * (TRAIN_HALF_W + radius);
        pz = c.z + rz * s * (TRAIN_HALF_W + radius);
        continue;
      }
      // End walls always solid.
      if (endPen > 0 && endPen < sidePen && alx < TRAIN_HALF_W + radius) {
        const s = lz >= 0 ? 1 : -1;
        const fx = Math.sin(c.yaw);
        const fz = Math.cos(c.yaw);
        px = c.x + fx * s * (halfLen + radius);
        pz = c.z + fz * s * (halfLen + radius);
      }
    }
  }
  return { x: px, z: pz };
}

/** Coach floor top (world y) under a point, incl. doorway bridge plates. */
export function coachFloorAt(x: number, z: number): number | null {
  let best: number | null = null;
  for (const [, cars] of liveCars) {
    for (let i = 1; i < cars.length; i++) {
      const c = cars[i];
      const { lx, lz } = carLocal(c, x, z);
      const onBridge = inDoorBand(lz, 0) && Math.abs(lx) <= TRAIN_HALF_W + BRIDGE_REACH;
      if (Math.abs(lz) > COACH_LEN / 2) continue;
      if (Math.abs(lx) > TRAIN_HALF_W && !onBridge) continue;
      const y = groundHeight(c.x, c.z) + COACH_FLOOR_Y;
      if (best === null || y > best) best = y;
    }
  }
  return best;
}

/** Rigid displacement of the coach under a point since last sim tick. */
export function carryDelta(x: number, z: number): { dx: number; dz: number } {
  for (const [lineId, cars] of liveCars) {
    const prev = prevLiveCars.get(lineId);
    if (!prev || prev.length !== cars.length) continue;
    for (let i = 1; i < cars.length; i++) {
      const { lx, lz } = carLocal(cars[i], x, z);
      if (Math.abs(lx) > TRAIN_HALF_W || Math.abs(lz) > COACH_LEN / 2) continue;
      return { dx: cars[i].x - prev[i].x, dz: cars[i].z - prev[i].z };
    }
  }
  return { dx: 0, dz: 0 };
}

export interface StationPlatform {
  x: number;
  z: number;
  yaw: number;
  halfW: number;
  halfL: number;
  topY: number;
}

/** Platform footprints (pos/yaw/length from the station builder math). */
export function stationPlatforms(): StationPlatform[] {
  // NOTE: must mirror Railway.tsx Station placement (lateral 4.6).
  const out: StationPlatform[] = [];
  for (const line of getLines()) {
    const platLen = consistLength(line.def.coachCount) + 30;
    for (const st of line.stations) {
      const rx = Math.cos(st.yaw);
      const rz = -Math.sin(st.yaw);
      const px = st.x + rx * 4.6;
      const pz = st.z + rz * 4.6;
      out.push({
        x: px,
        z: pz,
        yaw: st.yaw,
        halfW: 2.5,
        halfL: platLen / 2,
        topY: groundHeight(px, pz) + 1.1,
      });
    }
  }
  return out;
}

/** Platform top under a point when the player is high enough to mount it. */
export function platformTopAt(x: number, z: number, py: number): number | null {
  let best: number | null = null;
  for (const p of stationPlatforms()) {
    const dx = x - p.x;
    const dz = z - p.z;
    const lx = Math.cos(p.yaw) * dx - Math.sin(p.yaw) * dz;
    const lz = Math.sin(p.yaw) * dx + Math.cos(p.yaw) * dz;
    if (Math.abs(lx) > p.halfW || Math.abs(lz) > p.halfL) continue;
    if (py > p.topY - 0.5 && (best === null || p.topY > best)) best = p.topY;
  }
  return best;
}

// --- Boarding + seat math (pure functions of live car poses) ---

/** Coach interior heights above the car origin (rail top ≈ +0.35). */
export const COACH_FLOOR_Y = 0.95;
export const SEAT_TOP_Y = 1.5;
export const BERTH_TOP_Y = 1.7;
export const WINDOW_BAND_LO = 1.7;
export const WINDOW_BAND_HI = 2.7;

export interface SeatSpot {
  line: string;
  /** Coach index (1-based into live cars; 0 is the loco). */
  car: number;
  side: 1 | -1;
  kind: "seat" | "berth";
}

/** Nearest seat/berth furniture to an on-foot player inside a coach. */
export function seatProximity(world: GameWorld): SeatSpot | null {
  if (world.mode !== "walk") return null;
  let best: (SeatSpot & { d: number }) | null = null;
  for (const [lineId, cars] of liveCars) {
    const tr = world.trains.find((t) => t.line === lineId);
    const tdir = tr ? tr.dir : 1;
    for (let i = 1; i < cars.length; i++) {
      for (const side of [1, -1] as const) {
        const sa = seatAnchorWorld(cars[i], side, tdir);
        const ds = Math.hypot(world.playerPos.x - sa.x, world.playerPos.z - sa.z);
        if (ds < 1.8 && (!best || ds < best.d)) {
          best = { line: lineId, car: i, side, kind: "seat", d: ds };
        }
      }
      const ba = berthAnchorWorld(cars[i], tdir);
      const db = Math.hypot(world.playerPos.x - ba.x, world.playerPos.z - ba.z);
      if (db < 1.8 && (!best || db < best.d)) {
        best = { line: lineId, car: i, side: -1, kind: "berth", d: db };
      }
    }
  }
  if (!best) return null;
  return { line: best.line, car: best.car, side: best.side, kind: best.kind };
}

export interface SeatAnchor {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Seated anchor in a coach: 1.5 m behind center (travel sense), window side. */
export function seatAnchorWorld(
  c: { x: number; z: number; yaw: number },
  side: 1 | -1,
  dir: 1 | -1,
): SeatAnchor {
  const y = c.yaw + (dir < 0 ? Math.PI : 0);
  const fx = Math.sin(y);
  const fz = Math.cos(y);
  const rx = Math.cos(y);
  const rz = -Math.sin(y);
  return {
    x: c.x - fx * 1.5 + rx * side * 1.1,
    y: SEAT_TOP_Y,
    z: c.z - fz * 1.5 + rz * side * 1.1,
    yaw: y,
  };
}

export function seatAnchor(lineId: string, car: number, side: 1 | -1, dir: 1 | -1): SeatAnchor | null {
  const c = getLiveCars(lineId)[car];
  return c ? seatAnchorWorld(c, side, dir) : null;
}

/** Berth anchor: 2.8 m ahead of center (travel sense), opposite side. */
export function berthAnchorWorld(
  c: { x: number; z: number; yaw: number },
  dir: 1 | -1,
): SeatAnchor {
  const y = c.yaw + (dir < 0 ? Math.PI : 0);
  const fx = Math.sin(y);
  const fz = Math.cos(y);
  const rx = Math.cos(y);
  const rz = -Math.sin(y);
  return {
    x: c.x + fx * 2.8 - rx * 1.1,
    y: BERTH_TOP_Y,
    z: c.z + fz * 2.8 - rz * 1.1,
    yaw: y,
  };
}

export function berthAnchor(lineId: string, car: number, dir: 1 | -1): SeatAnchor | null {
  const c = getLiveCars(lineId)[car];
  return c ? berthAnchorWorld(c, dir) : null;
}

// --- 2D maps ---

/** Sparse polylines + stations + live markers for every line. */
export interface RailwayMapData {
  lines: { path: { x: number; z: number }[]; stations: { name: string; x: number; z: number }[]; color: string }[];
  trains: { x: number; z: number }[];
}

/** Back-compat shape for the previous single-line renderer. */
export function getRailwayMapData(): RailwayMapData {
  const lines = getLines().map((r) => {
    const path: { x: number; z: number }[] = [];
    for (let i = 0; i < r.path.length; i += 8) path.push(r.path[i]);
    path.push(r.path[r.path.length - 1]);
    return {
      path,
      stations: r.stations.map((s) => ({ name: s.short, x: s.x, z: s.z })),
      color: r.def.color,
    };
  });
  const trains: { x: number; z: number }[] = [];
  for (const seg of segments.values()) trains.push({ x: seg.hx, z: seg.hz });
  return { lines, trains };
}
