// Tamil Nadu railways: one shuttle consist per line, all-stop dwelling.
// Lines are data (stations + dwell config); each line is a smooth
// centripetal Catmull-Rom spline through its stations, straightened
// through every station so rails run on a true line under the stopped
// consist and its platform. Pure data + math (no React/Three at runtime,
// except a type-only GameWorld for the sim). Meshes live in
// components/game/scene/Railway.tsx + vehicles/train/Train.tsx.

import { latLonToGame } from "./tamilnadu";
import { groundHeight } from "./terrain";
import { formatTime } from "./time";
import type { GameWorld } from "../state";

export const TRAIN_SPEED = 25; // m/s top speed (~90 km/h feel at world scale)
/** Acceleration out of stations (m/s²): 0→full speed in ~5 s. */
export const TRAIN_ACCEL = 5;
/** Braking into stations (m/s²): gentle gradual slowdown from ~70 m out. */
export const TRAIN_BRAKE = 4.5;

export const LOCO_LEN = 14;
export const COACH_LEN = 12;
export const COACH_GAP = 1.2;
export const LOCO_GAP = 1.5;
/** Nose-to-tail length of a twin-loco + 4-coach push-pull consist. */
export const TRAIN_LENGTH =
  2 * LOCO_LEN + 2 * LOCO_GAP + 4 * COACH_LEN + 3 * COACH_GAP;

/** Push-pull consist: engine + coaches + engine (never turns — the rear
 * loco leads on the way back). */
export function consistLength(coachCount: number): number {
  return 2 * LOCO_LEN + 2 * LOCO_GAP + coachCount * COACH_LEN + (coachCount - 1) * COACH_GAP;
}

export interface StationDef {
  name: string;
  short: string;
  lon: number;
  lat: number;
  /** Game-meter nudge applied after projection (default 0). Used to lay
   * a second terminus platform side-by-side with an existing station —
   * e.g. Chennai West sits 14 m east of Chennai Central so the two
   * dwelling consists + platforms never overlap. */
  px?: number;
  pz?: number;
  /** Pin the station tangent (radians) instead of deriving it from the
   * spline. corridor faces sharing one lockYaw get platforms, tracks and
   * straightening on the exact same axis — ruler-straight. Pick the sign
   * to match the natural side so platforms don't flip across the rails. */
  lockYaw?: number;
}

export interface LineDef {
  id: string;
  /** Short display name for boards + signs (e.g. "East Coast Express"). */
  title: string;
  /** Map line color. */
  color: string;
  dwell: number; // seconds stopped at every station
  coachCount: number;
  stations: StationDef[];
  /** Invisible throat-shaping points after the first station (game meters,
   * relative to it). The spline runs through them so termini can exit
   * parallel before curving to their own routes — no dwells, platforms
   * or straightening here, pure curve control. */
  exitLeads?: { px: number; pz: number }[];
  /** Invisible curve-shaping points around any station (game meters,
   * relative to it): `before` shapes the approach, `after` the exit.
   * Lets junctions (e.g. Trichy) bend every line into a shared parallel
   * corridor ahead of the platforms. `before` is ignored for station 0
   * (the path must start exactly on it). */
  throatLeads?: { station: number; before?: { px: number; pz: number }[]; after?: { px: number; pz: number }[] }[];
  /** Game-hour the line starts running (e.g. 9 = 09:00). Until then the
   * consist waits docked at its first station with doors open. */
  startAt?: number;
  /** Line top speed (m/s). Defaults to TRAIN_SPEED; hill lines crawl. */
  topSpeed?: number;
}

export const LINES: LineDef[] = [
  {
    id: "chennai",
    title: "East Coast Express",
    color: "#1f5fa8",
    dwell: 60,
    coachCount: 6,
    // Throat exit: leave Chennai southwest, side-by-side with Route 2.
    exitLeads: [
      { px: -45, pz: 45 },
      { px: -100, pz: 100 },
    ],
    // First departure 08:30 — docked at Chennai with doors open until then.
    startAt: 8.5,
    // Villupuram N-S throat: double-track funnels each side of the row.
    throatLeads: [
      {
        station: 2,
        before: [
          { px: 120, pz: -420 },
          { px: 50, pz: -200 },
        ],
        after: [
          { px: 30, pz: 150 },
          { px: 120, pz: 300 },
        ],
      },
    ],
    stations: [
      { name: "Chennai Central", short: "CHENNAI", lon: 80.2707, lat: 13.0827, lockYaw: -Math.PI / 4 },
      { name: "Chengalpattu Junction", short: "CHENGALPATTU", lon: 79.9838, lat: 12.6936 },
      // Villupuram row slot (base point), locked dead N-S with the row.
      // 500 m funnels ease the NNE entry + SSE exit onto the corridor.
      { name: "Villupuram Junction", short: "VILLUPURAM", lon: 79.4917, lat: 11.9401, lockYaw: 0 },
      { name: "Cuddalore Port Junction", short: "CUDDALORE PORT", lon: 79.768, lat: 11.754 },
      { name: "Chidambaram", short: "CHIDAMBARAM", lon: 79.6936, lat: 11.3997 },
      { name: "Mayiladuthurai Junction", short: "MAYILADUTHURAI", lon: 79.6528, lat: 11.1012 },
      { name: "Kumbakonam", short: "KUMBAKONAM", lon: 79.3846, lat: 10.9617 },
      { name: "Thanjavur Junction", short: "THANJAVUR", lon: 79.1383, lat: 10.7852 },
      // Trichy terminus face locked dead E-W with the row (platform 2).
      { name: "Tiruchchirappalli Junction", short: "TRICHY JN", lon: 78.6856, lat: 10.7905, lockYaw: -Math.PI / 2 },
    ],
  },
  {
    id: "western",
    title: "Western Industrial",
    color: "#15803d",
    dwell: 60,
    coachCount: 6,
    // Same southwest throat exit as Route 1 (relative to its own +14 m
    // start): parallel out of the terminus, then curve west to Arakkonam.
    exitLeads: [
      { px: -45, pz: 45 },
      { px: -100, pz: 100 },
    ],
    // First departure 09:00 — docked at Chennai with doors open until then.
    startAt: 9,
    stations: [
      // Shared Chennai terminus: same real-world station as Route 1, laid
      // on the pure-lateral offset (11 m ESE) so all three dwells sit
      // exactly abreast — one row, never overlapping. Same name/short on
      // purpose — maps + sign boards read it as a single station. Locked
      // with the throat.
      { name: "Chennai Central", short: "CHENNAI", lon: 80.2707, lat: 13.0827, px: 7.8, pz: 7.8, lockYaw: -Math.PI / 4 },
      { name: "Arakkonam Junction", short: "ARAKKONAM", lon: 79.6696, lat: 13.0768, lockYaw: -Math.PI / 2 },
      { name: "Katpadi Junction", short: "KATPADI", lon: 79.1556, lat: 12.9698, lockYaw: -Math.PI / 2 },
      { name: "Jolarpettai Junction", short: "JOLARPETTAI", lon: 78.5724, lat: 12.5654 },
      { name: "Salem Junction", short: "SALEM", lon: 78.1401, lat: 11.652 },
      { name: "Erode Junction", short: "ERODE", lon: 77.7245, lat: 11.2756 },
      { name: "Tiruppur", short: "TIRUPPUR", lon: 77.3395, lat: 11.1088 },
      // Coimbatore terminus face locked dead E-W with the row pair.
      { name: "Coimbatore Junction", short: "COIMBATORE", lon: 76.9597, lat: 11.0007, lockYaw: -Math.PI / 2 },
    ],
  },
  {
    id: "southern",
    title: "Southern Main Line",
    color: "#7c3aed",
    dwell: 60,
    coachCount: 6,
    // First departure 09:30 — docked at Egmore with doors open until then.
    startAt: 9.5,
    // Trichy throat: funnel the NE approach + SW exit into the shared
    // E-W corridor before the platforms.
    // Villupuram N-S throat: double-track funnels each side of the row.
    throatLeads: [
      {
        station: 1,
        before: [
          { px: 150, pz: -500 },
          { px: 60, pz: -250 },
          { px: 20, pz: -100 },
        ],
        after: [
          { px: -10, pz: 150 },
          { px: -60, pz: 350 },
        ],
      },
      {
        station: 2,
        // ~500 m entry curve: swing from the Villupuram line onto the row.
        // Innermost lead sits ON the corridor axis so the station tangent
        // is dead level with the other three faces.
        before: [
          { px: 450, pz: -190 },
          { px: 300, pz: -80 },
          { px: 150, pz: 0 },
        ],
        // ~500 m exit curve: leave the row bending toward Dindigul.
        after: [
          { px: -150, pz: 0 },
          { px: -280, pz: 80 },
          { px: -430, pz: 250 },
        ],
      },
    ],
    stations: [
      // Own Egmore terminus, nudged 15 m west so its throat clears the
      // Central trainshed columns.
      { name: "Chennai Egmore", short: "EGMORE", lon: 80.2607, lat: 13.0789, px: -15 },
      // R3 runs the N-S row slot 14 m east of Route 1 (double-track
      // entry/exit pairs with it). Same name — one station on maps/boards.
      { name: "Villupuram Junction", short: "VILLUPURAM", lon: 79.4917, lat: 11.9401, px: 14, pz: 0, lockYaw: 0 },
      // Trichy face: second row slot (z=-14), dwell centered with the
      // row, locked dead level. Throat leads bend the approach/exit
      // parallel line-by-line.
      { name: "Tiruchchirappalli Junction", short: "TRICHY JN", lon: 78.6856, lat: 10.7905, px: 0, pz: -14, lockYaw: -Math.PI / 2 },
      { name: "Dindigul Junction", short: "DINDIGUL", lon: 77.983, lat: 10.3577 },
      { name: "Madurai Junction", short: "MADURAI", lon: 78.1023, lat: 9.9194 },
      { name: "Virudhunagar Junction", short: "VIRUDHUNAGAR", lon: 77.9624, lat: 9.568 },
      { name: "Tirunelveli Junction", short: "TIRUNELVELI", lon: 77.7079, lat: 8.7359 },
      { name: "Nagercoil Junction", short: "NAGERCOIL", lon: 77.4373, lat: 8.1757 },
      { name: "Kanniyakumari", short: "KANNIYAKUMARI", lon: 77.5385, lat: 8.0883 },
    ],
  },
  {
    id: "mannar",
    title: "Gulf of Mannar",
    color: "#0d9488",
    dwell: 60,
    coachCount: 6,
    // First departure 10:00.
    startAt: 10,
    // Trichy origin face on the shared E-W corridor, exiting east on a
    // ~500 m curve before swinging down to Pudukkottai. First lead sits ON
    // the corridor axis so the dwell sits dead level with the row.
    exitLeads: [
      { px: 260, pz: 0 },
      { px: 380, pz: 120 },
      { px: 420, pz: 350 },
    ],
    stations: [
      // Own Trichy face: front row slot (z=+16), locked dead level,
      // exiting east before curving down to Pudukkottai — platform 1.
      { name: "Tiruchchirappalli Junction", short: "TRICHY JN", lon: 78.6856, lat: 10.7905, px: 0, pz: 16, lockYaw: Math.PI / 2 },
      { name: "Pudukkottai", short: "PUDUKKOTTAI", lon: 78.8204, lat: 10.3797 },
      { name: "Karaikkudi Junction", short: "KARAIKKUDI", lon: 78.783, lat: 10.0669 },
      { name: "Ramanathapuram", short: "RAMANATHAPURAM", lon: 78.8273, lat: 9.3693 },
      { name: "Rameswaram", short: "RAMESWARAM", lon: 79.3091, lat: 9.2881 },
    ],
  },
  {
    id: "port",
    title: "Southern Port",
    color: "#db2777",
    dwell: 60,
    coachCount: 6,
    // First departure 10:30.
    startAt: 10.5,
    stations: [
      // Double-track corridor with Route 3 (Madurai → Tirunelveli):
      // parallel faces 12 m east, same names, dwells side-by-side.
      { name: "Madurai Junction", short: "MADURAI", lon: 78.1023, lat: 9.9194, px: 12 },
      { name: "Virudhunagar Junction", short: "VIRUDHUNAGAR", lon: 77.9624, lat: 9.568, px: 12 },
      { name: "Tirunelveli Junction", short: "TIRUNELVELI", lon: 77.7079, lat: 8.7359, px: 14 },
      { name: "Tiruchendur", short: "TIRUCHENDUR", lon: 78.1188, lat: 8.4958 },
      { name: "Thoothukudi", short: "THOOTHUKUDI", lon: 78.131, lat: 8.8072 },
    ],
  },
  {
    id: "kongu",
    title: "Kongu Inland",
    color: "#92400e",
    dwell: 60,
    coachCount: 6,
    // First departure 11:00.
    startAt: 11,
    stations: [
      // Double-track pair with Route 2's terminus/corridor, 20 m north,
      // locked dead level with it. Own east exit + buffer wall; dwells
      // run parallel, never touching.
      { name: "Coimbatore Junction", short: "COIMBATORE", lon: 76.9597, lat: 11.0007, pz: -20, lockYaw: Math.PI / 2 },
      { name: "Tiruppur", short: "TIRUPPUR", lon: 77.3395, lat: 11.1088, pz: -20 },
      { name: "Erode Junction", short: "ERODE", lon: 77.7245, lat: 11.2756, pz: -20 },
      { name: "Karur Junction", short: "KARUR", lon: 78.0733, lat: 10.9601 },
      // Own Trichy terminus face: back row slot (z=-28), locked dead
      // level, dwell centered with the row, buffer wall east.
      { name: "Tiruchchirappalli Junction", short: "TRICHY JN", lon: 78.6856, lat: 10.7905, px: 0, pz: -28, lockYaw: Math.PI / 2 },
    ],
    exitLeads: [
      { px: 45, pz: -3 },
      { px: 100, pz: -6 },
    ],
    // Trichy approach runway: straight E-W rails ~500 m into the corridor.
    throatLeads: [
      { station: 4, before: [{ px: -520, pz: 0 }, { px: -260, pz: 0 }, { px: -140, pz: 0 }] },
    ],
  },
  {
    id: "northern",
    title: "Northern Heritage",
    color: "#0891b2",
    dwell: 60,
    coachCount: 6,
    // First departure 11:30.
    startAt: 11.5,
    stations: [
      // Third Chennai face: 22 m ESE on the pure-lateral offset, same
      // southwest throat exit (triple parallel start, dwells abreast).
      // Bare platform under open sky beside the trainshed; same name —
      // one station everywhere.
      { name: "Chennai Central", short: "CHENNAI", lon: 80.2707, lat: 13.0827, px: 15.6, pz: 15.6, lockYaw: -Math.PI / 4 },
      { name: "Kancheepuram", short: "KANCHIPURAM", lon: 79.7065, lat: 12.8426 },
      // Arakkonam face: second row slot (14 m SOUTH of Route 2 — same side
      // as its platform). The Kanchipuram approach stays south throughout,
      // so these rails never touch Route 2's track or platform: fully
      // grade-separated double track. Locked dead level.
      { name: "Arakkonam Junction", short: "ARAKKONAM", lon: 79.6696, lat: 13.0768, px: 0, pz: 14, lockYaw: -Math.PI / 2 },
      // Katpadi face: second row slot (14 m NORTH of Route 2 — opposite
      // side from its platform). Locked dead level with it; funnel leads
      // bend the Arakkonam approach parallel before the platforms. Same
      // name — one station on maps + boards.
      { name: "Katpadi Junction", short: "KATPADI", lon: 79.1556, lat: 12.9698, px: 0, pz: -14, lockYaw: -Math.PI / 2 },
      { name: "Tiruvannamalai", short: "TIRUVANNAMALAI", lon: 79.0747, lat: 12.2319 },
      // Villupuram terminus face: third row slot (28 m east), locked dead
      // N-S with the row — arrives straight down the corridor from the
      // north, buffer wall south. Same name — one station.
      { name: "Villupuram Junction", short: "VILLUPURAM", lon: 79.4917, lat: 11.9401, px: 28, pz: 0, lockYaw: 0 },
    ],
    exitLeads: [
      { px: -45, pz: 45 },
      { px: -100, pz: 100 },
    ],
    // Arakkonam funnel: due-south approach running parallel to Route 2's
    // line, joining the row from the south (never crosses it).
    // Katpadi funnel: eastern approach running parallel to Route 2's
    // entry curve, joining the row from the east (never crosses it).
    throatLeads: [
      {
        station: 2,
        before: [
          { px: 60, pz: 420 },
          { px: 30, pz: 220 },
          { px: 10, pz: 90 },
        ],
      },
      {
        station: 3,
        before: [
          { px: 500, pz: -166 },
          { px: 250, pz: -66 },
          { px: 100, pz: -31 },
        ],
      },
    ],
  },
  {
    id: "hill",
    title: "Hill Country",
    color: "#334155",
    dwell: 60,
    // Short mountain consist, crawling pace — a different ride.
    coachCount: 4,
    topSpeed: 14,
    // First departure 12:00.
    startAt: 12,
    stations: [
      // Own Coimbatore face 80 m west on its own north-south spur, locked
      // dead N-S: straight northern run to Mettupalayam that never touches
      // the E-W row's rails (15 m+ clear of every stub, wall and dwell).
      // Same name — one station on maps + boards.
      { name: "Coimbatore Junction", short: "COIMBATORE", lon: 76.9597, lat: 11.0007, px: -80, pz: -40, lockYaw: Math.PI },
      { name: "Mettupalayam", short: "METTUPALAYAM", lon: 76.935, lat: 11.297 },
      { name: "Coonoor", short: "COONOOR", lon: 76.7936, lat: 11.3474 },
      { name: "Udhagamandalam", short: "OOTY", lon: 76.6953, lat: 11.4085 },
    ],
    exitLeads: [
      { px: -5, pz: -120 },
      { px: -10, pz: -260 },
      { px: -15, pz: -450 },
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
  /** Head-travel bounds: first/last station arc positions ± half consist
   * (dwells center the consist, so the head stops half a length past). */
  headMin: number;
  headMax: number;
  /** Ride-height profile: smoothed track Y every DECK_DS meters. Equals
   * the terrain on land, deck plate (2.5 m) over water with graded ramps
   * — bridges ride over the sea instead of diving to the seabed. */
  deckDs: number;
  deckY: number[];
}

const STATION_STRAIGHT_FEATHER = 80;
/** Straight buffer stubs past each terminus so dwelling/departing consists
 * (≤93.5 m) never clamp onto the path ends. */
const BUFFER_M = 120;

interface XZ {
  x: number;
  z: number;
}

/** Centripetal Catmull-Rom point for span p1→p2 at t∈[0,1] (no overshoot
 * on sharp station corners, tangent-continuous through every station). */
function catmullRom(p0: XZ, p1: XZ, p2: XZ, p3: XZ, t: number): XZ {
  const d = (a: XZ, b: XZ) => Math.hypot(b.x - a.x, b.z - a.z);
  const t0 = 0;
  const t1 = t0 + Math.pow(d(p0, p1), 0.5);
  const t2 = t1 + Math.pow(d(p1, p2), 0.5);
  const t3 = t2 + Math.pow(d(p2, p3), 0.5);
  const tt = t1 + t * (t2 - t1);
  const mix = (a: XZ, b: XZ, ta: number, tb: number): XZ => {
    const k = tb > ta ? (tt - ta) / (tb - ta) : 0;
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
  };
  const A1 = mix(p0, p1, t0, t1);
  const A2 = mix(p1, p2, t1, t2);
  const A3 = mix(p2, p3, t2, t3);
  const B1 = mix(A1, A2, t0, t2);
  const B2 = mix(A2, A3, t1, t3);
  return mix(B1, B2, t1, t2);
}

function smoothstep01(k: number): number {
  const c = Math.min(1, Math.max(0, k));
  return c * c * (3 - 2 * c);
}

function buildLine(def: LineDef): BuiltLine {
  const stationPt = (s: StationDef) => {
    const g = latLonToGame(s.lon, s.lat);
    return { x: g.x + (s.px ?? 0), z: g.z + (s.pz ?? 0) };
  };
  // Curve-shaping nodes: legacy exitLeads after station 0 plus per-station
  // throatLeads (before/after any station). All are curve points only —
  // never stations, dwells, or platforms.
  const beforeFor = (i: number): { px: number; pz: number }[] => {
    if (i === 0) return [];
    return def.throatLeads?.find((t) => t.station === i)?.before ?? [];
  };
  const afterFor = (i: number): { px: number; pz: number }[] => {
    const out = [...(i === 0 ? (def.exitLeads ?? []) : [])];
    const extra = def.throatLeads?.find((t) => t.station === i)?.after;
    if (extra) out.push(...extra);
    return out;
  };
  const pts: XZ[] = [];
  const stationNodePos: number[] = [];
  def.stations.forEach((s, i) => {
    const base = stationPt(s);
    for (const l of beforeFor(i)) pts.push({ x: base.x + l.px, z: base.z + l.pz });
    stationNodePos.push(pts.length);
    pts.push(base);
    for (const l of afterFor(i)) pts.push({ x: base.x + l.px, z: base.z + l.pz });
  });
  const path: { x: number; z: number }[] = [];
  const cum: number[] = [0];
  const push = (p: { x: number; z: number }) => {
    path.push(p);
    if (path.length > 1) {
      const q = path[path.length - 2];
      cum.push(cum[cum.length - 1] + Math.hypot(p.x - q.x, p.z - q.z));
    }
  };
  const at = (i: number) => pts[Math.min(pts.length - 1, Math.max(0, i))];
  // Arc length at the end of each span; station i (i>0) sits at the end of
  // the span feeding its node (node pos − 1), station 0 at arc 0.
  const spanEndS: number[] = [];
  for (let span = 0; span < pts.length - 1; span++) {
    const p0 = at(span - 1);
    const p1 = at(span);
    const p2 = at(span + 1);
    const p3 = at(span + 2);
    const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const samples = Math.min(256, Math.max(24, Math.round(dist / 13)));
    for (let i = span === 0 ? 0 : 1; i <= samples; i++) {
      push(catmullRom(p0, p1, p2, p3, i / samples));
    }
    spanEndS.push(cum[cum.length - 1]);
  }
  const jointS: number[] = def.stations.map((_, i) =>
    i === 0 ? 0 : spanEndS[stationNodePos[i] - 1],
  );
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
    // Locked corridor tangents (exact parallel platforms/tracks).
    return { ...s, x: pose.x, z: pose.z, yaw: s.lockYaw ?? pose.yaw, s: shift + jointS[i] };
  });
  // Straighten the track through every station: pin samples near each
  // station onto its tangent line (full strength under the platform,
  // smoothstep-feathered beyond) so rails, sleepers, the stopped consist
  // and the platform all share one true line at stops.
  const halfPlat = (consistLength(def.coachCount) + 30) / 2;
  const outer = halfPlat + STATION_STRAIGHT_FEATHER;
  for (const st of stations) {
    const tx = Math.sin(st.yaw);
    const tz = Math.cos(st.yaw);
    for (let i = 0; i < full.length; i++) {
      const d = fullCum[i] - st.s;
      const ad = Math.abs(d);
      if (ad >= outer) continue;
      const w = ad <= halfPlat ? 1 : 1 - smoothstep01((ad - halfPlat) / STATION_STRAIGHT_FEATHER);
      const px = st.x + tx * d;
      const pz = st.z + tz * d;
      full[i] = { x: full[i].x + (px - full[i].x) * w, z: full[i].z + (pz - full[i].z) * w };
    }
  }
  // Re-accumulate arc lengths, then re-pin each station's arc position to
  // its (unchanged) location so dwell stops land exactly on the line.
  fullCum[0] = 0;
  for (let i = 1; i < full.length; i++) {
    fullCum[i] = fullCum[i - 1] + Math.hypot(full[i].x - full[i - 1].x, full[i].z - full[i - 1].z);
  }
  for (const st of stations) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < full.length; i++) {
      const dd = Math.hypot(full[i].x - st.x, full[i].z - st.z);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    }
    st.s = fullCum[best];
  }
  const fullLen = fullCum[fullCum.length - 1];
  const halfConsist = consistLength(def.coachCount) / 2;
  // Ride-height profile: deck plate over water, terrain on land, graded
  // ramps at shorelines (two smoothing passes over the raw step).
  const DECK_DS = 8;
  const deckN = Math.ceil(fullLen / DECK_DS) + 1;
  const deckY: number[] = new Array(deckN);
  const deckAt = (s: number): { x: number; z: number } => {
    const sc = Math.min(fullLen, Math.max(0, s));
    let i = 0;
    while (i < fullCum.length - 2 && fullCum[i + 1] < sc) i++;
    const a = fullCum[i];
    const b = fullCum[i + 1];
    const k = b > a ? (sc - a) / (b - a) : 0;
    const p0 = full[i];
    const p1 = full[i + 1];
    return { x: p0.x + (p1.x - p0.x) * k, z: p0.z + (p1.z - p0.z) * k };
  };
  for (let i = 0; i < deckN; i++) {
    const p = deckAt(i * DECK_DS);
    const g = groundHeight(p.x, p.z);
    deckY[i] = g < 1.0 ? DECK_PLATE_Y : g;
  }
  for (let pass = 0; pass < 2; pass++) {
    const src = [...deckY];
    for (let i = 0; i < deckN; i++) {
      let sum = 0;
      let n = 0;
      for (let k = -5; k <= 5; k++) {
        const j = i + k;
        if (j < 0 || j >= deckN) continue;
        sum += src[j];
        n++;
      }
      deckY[i] = sum / n;
    }
  }
  const built: BuiltLine = {
    def,
    stations,
    path: full,
    cum: fullCum,
    length: fullLen,
    headMin: stations[0].s - halfConsist,
    headMax: stations[stations.length - 1].s + halfConsist,
    deckDs: DECK_DS,
    deckY,
  };
  registerBridgeSpans(built);
  return built;
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

/** Deck plate height over water (above the y=0.3 ocean plane). */
export const DECK_PLATE_Y = 2.5;

/** Ride height (track top datum) at arc distance s: terrain on land,
 * deck plate over water with graded shoreline ramps. */
export function trackDeckAt(lineId: string, s: number): number {
  const r = getLine(lineId);
  const sc = Math.min(r.length, Math.max(0, s));
  const f = sc / r.deckDs;
  const i = Math.min(r.deckY.length - 2, Math.max(0, Math.floor(f)));
  const k = Math.min(1, Math.max(0, f - i));
  return r.deckY[i] + (r.deckY[i + 1] - r.deckY[i]) * k;
}

export interface BridgeSpan {
  x: number;
  z: number;
  /** Deck top (track datum). */
  top: number;
  /** Seabed below. */
  bot: number;
}

const bridgeSpans: BridgeSpan[] = [];

/** Record trestle-pier spots wherever a fresh line rides above water.
 * Works straight off the built object (never getLine — this runs
 * mid-build, before the line is cached). */
function registerBridgeSpans(r: BuiltLine): void {
  const deckAtLocal = (s: number): number => {
    const sc = Math.min(r.length, Math.max(0, s));
    const f = sc / r.deckDs;
    const i = Math.min(r.deckY.length - 2, Math.max(0, Math.floor(f)));
    const k = Math.min(1, Math.max(0, f - i));
    return r.deckY[i] + (r.deckY[i + 1] - r.deckY[i]) * k;
  };
  for (let s = 0; s <= r.length; s += 16) {
    const top = deckAtLocal(s);
    const p = trackPointAtLength(r.path, r.cum, r.length, s);
    const bot = groundHeight(p.x, p.z);
    if (top > bot + 0.8) bridgeSpans.push({ x: p.x, z: p.z, top, bot });
  }
}

/** All over-water trestle spots across built lines (for pier meshes). */
export function railBridgeSpans(): BridgeSpan[] {
  getLines();
  return bridgeSpans;
}

/** TrackDatum height under a world point: deck plate near railed bridge
 * spans, terrain everywhere else. Use for anything that must sit on the
 * rails (cars, coach floors, track meshes, buffer stops). */
export function railSurfaceY(x: number, z: number): number {
  let best: number | null = null;
  for (const b of bridgeSpans) {
    const dx = x - b.x;
    if (dx > 7 || dx < -7) continue;
    const dz = z - b.z;
    if (dx * dx + dz * dz > 49) continue;
    if (best === null || b.top > best) best = b.top;
  }
  return best ?? groundHeight(x, z);
}

/** Center pose of every car — engine first, coaches, engine last — given
 * the consist CENTER distance + direction of travel. The consist is rigid
 * in the line frame (index 0 is always the +s engine): reversals only flip
 * travel direction, so nothing ever teleports or turns around. y is the
 * deck datum (bridge plate over water). */
export function trainCarCenters(
  lineId: string,
  centerS: number,
  _dir: 1 | -1,
): { x: number; y: number; z: number; yaw: number }[] {
  const r = getLine(lineId);
  const n = r.def.coachCount;
  const C = consistLength(n);
  const at = (s: number) => {
    const p = trackPointAtLength(r.path, r.cum, r.length, s);
    return { x: p.x, y: trackDeckAt(lineId, s), z: p.z, yaw: p.yaw };
  };
  const out = [at(centerS + (C / 2 - LOCO_LEN / 2))];
  for (let i = 0; i < n; i++) {
    out.push(
      at(centerS + (C / 2 - LOCO_LEN - LOCO_GAP - COACH_LEN / 2 - i * (COACH_LEN + COACH_GAP))),
    );
  }
  out.push(at(centerS - (C / 2 - LOCO_LEN / 2)));
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
  /** Station index of the last dwell (skipped until another station
   * dwells — the reverse-direction target of the same station lies a
   * consist-length behind and must not re-trigger on departure). */
  lastStop: number;
  /** True until the line's startAt hour: consist holds docked at the
   * first station with doors open instead of running. */
  held: boolean;
  /** Current speed (m/s): eases up out of stations, brakes into them. */
  speed: number;
}

export function initialTrainState(): TrainSimState[] {
  return LINES.map((d) => {
    const r = getLine(d.id);
    // Start docked: consist CENTER on the first station, ready to board.
    const s = r.stations[0].s;
    return { line: d.id, s, dir: 1 as const, wait: 2, x: 0, z: 0, angle: 0, lastStop: -1, held: d.startAt !== undefined, speed: 0 };
  });
}

interface TrainSegment {
  hx: number;
  hz: number;
  tx: number;
  tz: number;
}

const segments = new Map<string, TrainSegment>();
const liveCars = new Map<string, { x: number; y: number; z: number; yaw: number }[]>();
const prevLiveCars = new Map<string, { x: number; y: number; z: number; yaw: number }[]>();
const stoppedLines = new Set<string>();

function stepTrain(t: TrainSimState, dt: number, now: number): void {
  const r = getLine(t.line);
  // t.s is the consist CENTER: dwells land it exactly on the station so
  // every doorway faces the platform and boarding is a level step anywhere.
  const C = consistLength(r.def.coachCount);
  const firstS = r.stations[0].s;
  const lastS = r.stations[r.stations.length - 1].s;
  // Scheduled start: hold docked (doors open) until the line's start hour.
  if (t.held) {
    if (r.def.startAt === undefined || now >= r.def.startAt) {
      t.held = false;
      t.wait = 0;
    } else {
      t.wait = 1;
    }
  }
  if (t.wait > 0) {
    t.wait = Math.max(0, t.wait - dt);
    t.speed = 0;
  } else if (!t.held) {
    // Next stop ahead (dwell targets center the consist on the station).
    // The consist pulls away slowly, cruises, then brakes gradually so it
    // glides to a halt exactly on the platform — no more instant stops.
    // Reversals only flip travel direction: the twin engines never move.
    let target = 0;
    let targetIdx = -1;
    let bestD = Infinity;
    for (let i = 0; i < r.stations.length; i++) {
      if (i === t.lastStop) continue;
      const d = (r.stations[i].s - t.s) * t.dir;
      if (d > 0.01 && d < bestD) {
        bestD = d;
        target = r.stations[i].s;
        targetIdx = i;
      }
    }
    if (targetIdx < 0) {
      // No station ahead (should not happen on multi-stop lines): cruise
      // to the far terminus and turn around there.
      target = t.dir > 0 ? lastS : firstS;
      bestD = Math.max(0, (target - t.s) * t.dir);
    }
    const dist = Math.max(0, bestD);
    const vMax = r.def.topSpeed ?? TRAIN_SPEED;
    const vAllow = Math.sqrt(2 * TRAIN_BRAKE * dist);
    t.speed = Math.min(t.speed + TRAIN_ACCEL * dt, vMax, vAllow);
    const step = t.speed * dt;
    if (step >= dist || dist < 0.25) {
      // Arrived: snap centered, doors open, termini flip direction.
      t.s = target;
      t.speed = 0;
      if (targetIdx >= 0) {
        t.wait = r.def.dwell;
        t.lastStop = targetIdx;
        if (targetIdx === 0) t.dir = 1;
        else if (targetIdx === r.stations.length - 1) t.dir = -1;
      } else {
        t.wait = r.def.dwell;
        t.dir = t.dir > 0 ? -1 : 1;
      }
    } else {
      t.s += t.dir * step;
    }
    if (t.s >= lastS) {
      t.s = lastS;
      t.dir = -1;
      t.speed = 0;
      t.wait = r.def.dwell;
    } else if (t.s <= firstS) {
      t.s = firstS;
      t.dir = 1;
      t.speed = 0;
      t.wait = r.def.dwell;
    }
  }
  // Live marker rides the leading nose; the sim pose stays centered.
  const headS = t.s + t.dir * (C / 2);
  const head = trackPointAtLength(r.path, r.cum, r.length, headS);
  t.x = head.x;
  t.z = head.z;
  t.angle = head.yaw + (t.dir < 0 ? Math.PI : 0);
  const cars = trainCarCenters(t.line, t.s, t.dir);
  const prev = liveCars.get(t.line);
  if (prev) prevLiveCars.set(t.line, prev);
  liveCars.set(t.line, cars);
  const tailS = Math.min(r.length, Math.max(0, t.s - t.dir * (C / 2)));
  const tail = trackPointAtLength(r.path, r.cum, r.length, tailS);
  segments.set(t.line, { hx: head.x, hz: head.z, tx: tail.x, tz: tail.z });
}

export function updateTrains(world: GameWorld, dt: number): void {
  stoppedLines.clear();
  for (const t of world.trains) {
    stepTrain(t, dt, world.time);
    if (t.wait > 0) stoppedLines.add(t.line);
  }
}

/** Live car poses for boarding/pose math (empty until the sim ticks). */
export function getLiveCars(lineId: string): { x: number; y: number; z: number; yaw: number }[] {
  return liveCars.get(lineId) ?? [];
}

// --- Departure boards ---

export interface UpcomingStop {
  name: string;
  etaClock: string;
}

export interface DepartureInfo {
  /** e.g. "EAST COAST EXPRESS → TRICHY JN". */
  title: string;
  /** e.g. "BOARDING · CHENNAI", "EN ROUTE · 87 KM/H", "FIRST DEP 08:30". */
  status: string;
  /** Next stations ahead with predicted clock times. */
  upcoming: UpcomingStop[];
}

/** Timetable snapshot for a line's LED board (pure function of sim state). */
export function lineDeparture(lineId: string, t: TrainSimState, now: number): DepartureInfo {
  const line = getLine(lineId);
  const dest =
    t.dir > 0
      ? line.stations[line.stations.length - 1].short
      : line.stations[0].short;
  let status: string;
  if (t.held) {
    status = `FIRST DEP ${line.def.startAt !== undefined ? formatTime(line.def.startAt) : "--:--"}`;
  } else if (t.wait > 0) {
    const at = t.lastStop >= 0 ? line.stations[t.lastStop].short : "";
    status = at ? `BOARDING · ${at}` : "BOARDING";
  } else {
    status = `EN ROUTE · ${Math.round(t.speed * 3.6)} KM/H`;
  }
  const ahead: { d: number; name: string }[] = [];
  for (const st of line.stations) {
    const d = (st.s - t.s) * t.dir;
    if (d > 1) ahead.push({ d, name: st.short });
  }
  ahead.sort((a, b) => a.d - b.d);
  const cruise = line.def.topSpeed ?? TRAIN_SPEED;
  const upcoming = ahead.slice(0, 3).map((a) => ({
    name: a.name,
    // Real seconds at cruise ≈ game-minutes (1 real min = 1 game hour);
    // +10% covers the accel/brake curves.
    etaClock: formatTime(now + ((a.d / cruise) * 1.1) / 3600),
  }));
  return { title: `${line.def.title.toUpperCase()} → ${dest}`, status, upcoming };
}

/** Coach shell half-width (cars are 4 m wide). */
export const TRAIN_HALF_W = 2.0;
/** Doorway clear half-width; gaps centered at ±DOOR_AT along each coach. */
export const DOOR_AT = 4.5;
export const DOOR_HALF = 0.9;
/** Bridge plates extend this far past the wall at doorways. */
export const BRIDGE_REACH = 0.7;
/** Gangway walkway half-width: matches the open collision gangway (0.55)
 * plus margin so the floor has no slivers at the edges. */
export const GANGWAY_HALF_W = 0.8;

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
      const last = cars.length - 1;
      const halfLen = (i === 0 || i === last ? LOCO_LEN : COACH_LEN) / 2;
      const { lx, lz } = carLocal(c, px, pz);
      const alx = Math.abs(lx);
      const alz = Math.abs(lz);
      if (alx > TRAIN_HALF_W + radius || alz > halfLen + radius) continue;
      const doorsOpen = stopped && i > 0 && i < last && inDoorBand(lz, radius * 0.5);
      // Side walls: solid from the outside (except open doorways), but
      // free once inside so riders can walk the cabin and ride standing.
      // Crossing outward is bounced back unless through an open doorway
      // (so nobody falls out of a moving train).
      const sidePen = TRAIN_HALF_W + radius - alx;
      const endPen = halfLen + radius - alz;
      const insideShell = alx <= TRAIN_HALF_W;
      // Open gangway between coaches (|lx| < 0.55). Both engines (first
      // and last car) are sealed: their end walls are fully solid so
      // riders can never walk into the solid engine meshes.
      const inGangway = i > 0 && i < cars.length - 1 && alx < 0.55 + radius * 0.5;
      if (insideShell) {
        const atWall = alx > TRAIN_HALF_W - radius;
        if (atWall && !(doorsOpen && inDoorBand(lz, 0))) {
          const s = lx >= 0 ? 1 : -1;
          const rx = Math.cos(c.yaw);
          const rz = -Math.sin(c.yaw);
          px = c.x + rx * s * (TRAIN_HALF_W - radius);
          pz = c.z + rz * s * (TRAIN_HALF_W - radius);
        }
        // End walls hold from the inside too (gangway stays walkable).
        const loc = carLocal(c, px, pz);
        if (!inGangway && Math.abs(loc.lz) > halfLen - radius) {
          const s = loc.lz >= 0 ? 1 : -1;
          const nlz = s * (halfLen - radius);
          const rx2 = Math.cos(c.yaw);
          const rz2 = -Math.sin(c.yaw);
          const fx2 = Math.sin(c.yaw);
          const fz2 = Math.cos(c.yaw);
          px = c.x + rx2 * loc.lx + fx2 * nlz;
          pz = c.z + rz2 * loc.lx + fz2 * nlz;
        }
        continue;
      }
      if (!doorsOpen && sidePen > 0 && sidePen <= endPen && alz < halfLen + radius) {
        const s = lx >= 0 ? 1 : -1;
        const rx = Math.cos(c.yaw);
        const rz = -Math.sin(c.yaw);
        px = c.x + rx * s * (TRAIN_HALF_W + radius);
        pz = c.z + rz * s * (TRAIN_HALF_W + radius);
        continue;
      }
      // End walls solid except the open gangway (|lx| < 0.55) between cars.
      if (!inGangway && endPen > 0 && endPen < sidePen && alx < TRAIN_HALF_W + radius) {
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

/** Coach floor top (world y) under a point, incl. doorway bridge plates
 * and gangway stubs past each coach end so walking car-to-car never gaps. */
export function coachFloorAt(x: number, z: number): number | null {
  let best: number | null = null;
  for (const [lineId, cars] of liveCars) {
    const n = getLine(lineId).def.coachCount;
    for (let i = 1; i <= n; i++) {
      const c = cars[i];
      const { lx, lz } = carLocal(c, x, z);
      const onBridge = inDoorBand(lz, 0) && Math.abs(lx) <= TRAIN_HALF_W + BRIDGE_REACH;
      const onGangway =
        Math.abs(lx) <= GANGWAY_HALF_W && Math.abs(lz) <= COACH_LEN / 2 + GANGWAY_HALF_W;
      if (Math.abs(lz) > COACH_LEN / 2 && !onGangway) continue;
      if (Math.abs(lz) <= COACH_LEN / 2 && Math.abs(lx) > TRAIN_HALF_W && !onBridge && !onGangway) continue;
      const y = c.y + COACH_FLOOR_Y;
      if (best === null || y > best) best = y;
    }
  }
  return best;
}

/** Max feet rise above the coach floor: a small hop whose head stays
 * under the roof crown (~3.5 m) instead of popping out through it. */
export const COACH_HEADROOM = 0.35;

/** Ceiling cap (world y) when standing inside a coach, null otherwise. */
export function coachCapAt(x: number, z: number): number | null {
  for (const [lineId, cars] of liveCars) {
    const n = getLine(lineId).def.coachCount;
    for (let i = 1; i <= n; i++) {
      const c = cars[i];
      const { lx, lz } = carLocal(c, x, z);
      if (Math.abs(lx) > TRAIN_HALF_W || Math.abs(lz) > COACH_LEN / 2) continue;
      return c.y + COACH_FLOOR_Y + COACH_HEADROOM;
    }
  }
  return null;
}

/** Occupied-coach cabin anchor for the interior follow-light
 * (null when the point is not inside any coach). */
export function coachInteriorAt(x: number, z: number): { x: number; y: number; z: number } | null {
  for (const [lineId, cars] of liveCars) {
    const n = getLine(lineId).def.coachCount;
    for (let i = 1; i <= n; i++) {
      const c = cars[i];
      const { lx, lz } = carLocal(c, x, z);
      if (Math.abs(lx) > TRAIN_HALF_W + 0.2 || Math.abs(lz) > COACH_LEN / 2 + 0.2) continue;
      return { x: c.x, y: c.y + 2.4, z: c.z };
    }
  }
  return null;
}
/** Rigid displacement of the coach under a point since last sim tick. */
export function carryDelta(x: number, z: number): { dx: number; dz: number } {
  for (const [lineId, cars] of liveCars) {
    const prev = prevLiveCars.get(lineId);
    if (!prev || prev.length !== cars.length) continue;
    const n = getLine(lineId).def.coachCount;
    for (let i = 1; i <= n; i++) {
      const { lx, lz } = carLocal(cars[i], x, z);
      const onGangway =
        Math.abs(lx) <= GANGWAY_HALF_W && Math.abs(lz) <= COACH_LEN / 2 + GANGWAY_HALF_W;
      if ((Math.abs(lx) > TRAIN_HALF_W || Math.abs(lz) > COACH_LEN / 2) && !onGangway) continue;
      return { dx: cars[i].x - prev[i].x, dz: cars[i].z - prev[i].z };
    }
  }
  return { dx: 0, dz: 0 };
}

export interface StationPlatform {
  /** "lineId:index" identity (lets collision skip furniture on bare faces). */
  key: string;
  x: number;
  z: number;
  yaw: number;
  halfW: number;
  halfL: number;
  topY: number;
}

/** Platform faces rendered bare (grand station covers them): their shelter
 * posts / benches / signs / lamps must not collide invisibly. Platform
 * side walls always stay solid. Single source — Railway.tsx renders from
 * this set too. */
export const OPEN_PLATFORM_FACES: ReadonlySet<string> = new Set([
  "chennai:0",
  "western:0",
  "northern:0",
  "chennai:8",
  "southern:2",
  "mannar:0",
  "kongu:4",
  "western:1",
  "northern:2",
  // Villupuram fan complex (one concourse, three bare faces).
  "chennai:2",
  "southern:1",
  "northern:5",
  // Coimbatore row pair (one shed over both termini).
  "western:7",
  "kongu:0",
  // Double-track pair halts (one shared name board each).
  "southern:4",
  "port:0",
  "southern:5",
  "port:1",
  "southern:6",
  "port:2",
  "western:5",
  "kongu:2",
  "western:6",
  "kongu:1",
  // Katpadi row pair (one shed over both faces).
  "western:2",
  "northern:3",
]);

/** Platform footprints (pos/yaw/length from the station builder math). */
export function stationPlatforms(): StationPlatform[] {
  // NOTE: must mirror Railway.tsx Station placement (lateral 4.6).
  const out: StationPlatform[] = [];
  for (const line of getLines()) {
    const platLen = consistLength(line.def.coachCount) + 30;
    for (let i = 0; i < line.stations.length; i++) {
      const st = line.stations[i];
      const rx = Math.cos(st.yaw);
      const rz = -Math.sin(st.yaw);
      const px = st.x + rx * 4.6;
      const pz = st.z + rz * 4.6;
      out.push({
        key: `${line.def.id}:${i}`,
        x: px,
        z: pz,
        yaw: st.yaw,
        halfW: 2.5,
        halfL: platLen / 2,
        // Flush with the coach floor (COACH_FLOOR_Y) so boarding is a
        // level step across the bridge plates instead of a jump.
        topY: groundHeight(px, pz) + COACH_FLOOR_Y,
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

export interface PlatformStep {
  x: number;
  z: number;
  yaw: number;
  halfW: number;
  halfL: number;
  topY: number;
}

/**
 * Walkable stair treads at both ends of every platform (mirrors the
 * visual steps in Railway.tsx: outer tread +0.32, inner tread +0.63 over
 * local ground, then the 0.95 platform top). Lets players climb without
 * jumping.
 */
export function platformSteps(): PlatformStep[] {
  const out: PlatformStep[] = [];
  for (const line of getLines()) {
    const platLen = consistLength(line.def.coachCount) + 30;
    for (const st of line.stations) {
      const rx = Math.cos(st.yaw);
      const rz = -Math.sin(st.yaw);
      const px = st.x + rx * 4.6;
      const pz = st.z + rz * 4.6;
      const fx = Math.sin(st.yaw);
      const fz = Math.cos(st.yaw);
      for (const e of [1, -1]) {
        const outer: PlatformStep = {
          x: px + fx * e * (platLen / 2 + 0.85),
          z: pz + fz * e * (platLen / 2 + 0.85),
          yaw: st.yaw,
          halfW: 1.5,
          halfL: 0.45,
          topY: 0,
        };
        outer.topY = groundHeight(outer.x, outer.z) + 0.32;
        const inner: PlatformStep = {
          x: px + fx * e * (platLen / 2 + 0.3),
          z: pz + fz * e * (platLen / 2 + 0.3),
          yaw: st.yaw,
          halfW: 1.5,
          halfL: 0.45,
          topY: 0,
        };
        inner.topY = groundHeight(inner.x, inner.z) + 0.63;
        out.push(outer, inner);
      }
    }
  }
  return out;
}

/** Step top under a point (same mount rule as platforms). */
export function stairTopAt(x: number, z: number, py: number): number | null {
  let best: number | null = null;
  for (const s of platformSteps()) {
    const dx = x - s.x;
    const dz = z - s.z;
    const lx = Math.cos(s.yaw) * dx - Math.sin(s.yaw) * dz;
    const lz = Math.sin(s.yaw) * dx + Math.cos(s.yaw) * dz;
    if (Math.abs(lx) > s.halfW || Math.abs(lz) > s.halfL) continue;
    if (py > s.topY - 0.5 && (best === null || s.topY > best)) best = s.topY;
  }
  return best;
}

/**
 * Station solid collision: platform side walls (skipped when standing on
 * top), shelter posts, benches, sign posts and lamps as circle colliders
 * (skipped when above them). Keeps players/bikes from phasing through
 * the station; stairs remain the way up.
 */
export function collideStation(
  x: number,
  z: number,
  radius: number,
  py: number,
): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (const p of stationPlatforms()) {
    // Side walls.
    if (py <= p.topY - 0.4) {
      const dx = px - p.x;
      const dz = pz - p.z;
      const lx = Math.cos(p.yaw) * dx - Math.sin(p.yaw) * dz;
      const lz = Math.sin(p.yaw) * dx + Math.cos(p.yaw) * dz;
      const penX = p.halfW + radius - Math.abs(lx);
      const penZ = p.halfL + radius - Math.abs(lz);
      if (penX > 0 && penZ > 0) {
        if (penX < penZ) {
          const s = lx >= 0 ? 1 : -1;
          const nlx = s * (p.halfW + radius);
          px = p.x + Math.cos(p.yaw) * nlx + Math.sin(p.yaw) * lz;
          pz = p.z - Math.sin(p.yaw) * nlx + Math.cos(p.yaw) * lz;
        } else {
          const s = lz >= 0 ? 1 : -1;
          const nlz = s * (p.halfL + radius);
          px = p.x + Math.cos(p.yaw) * lx + Math.sin(p.yaw) * nlz;
          pz = p.z - Math.sin(p.yaw) * lx + Math.cos(p.yaw) * nlz;
        }
      }
    }
    // Prop circles in platform-local coords: [lx, lz, radius, topLocalY].
    // Skipped on bare grand-station faces (no furniture rendered there —
    // colliding invisibly would feel broken).
    if (OPEN_PLATFORM_FACES.has(p.key)) continue;
    const gy = p.topY - COACH_FLOOR_Y;
    const props: Array<[number, number, number, number]> = [
      [-1.5, -6, 0.35, 3.4],
      [1.5, -6, 0.35, 3.4],
      [-1.5, 6, 0.35, 3.4],
      [1.5, 6, 0.35, 3.4],
      [0.8, -3, 0.85, 1.7],
      [0.8, 3, 0.85, 1.7],
      [-2.6, -2.4, 0.3, 4.6],
      [-2.6, 2.4, 0.3, 4.6],
      [3.2, -14, 0.35, 6.0],
      [3.2, 14, 0.35, 6.0],
    ];
    for (const [olx, olz, cr, top] of props) {
      if (py > gy + top - 0.4) continue;
      const wx = p.x + Math.cos(p.yaw) * olx + Math.sin(p.yaw) * olz;
      const wz = p.z - Math.sin(p.yaw) * olx + Math.cos(p.yaw) * olz;
      const dx = px - wx;
      const dz = pz - wz;
      const d = Math.hypot(dx, dz);
      const min = cr + radius;
      if (d < min && d > 1e-4) {
        px = wx + (dx / d) * min;
        pz = wz + (dz / d) * min;
      }
    }
  }
  return { x: px, z: pz };
}

// --- Station building collision (single source of truth for the hall
// footprints rendered in Railway.tsx: same centers, sizes, yaw) ---

export interface BuildingBox {
  x: number;
  z: number;
  yaw: number;
  halfW: number;
  halfL: number;
  topY: number;
}

/** Solid station buildings: the Trichy concourse hall (36×16 + margin),
 * the Villupuram row hall (16×36 + margin, yaw π/2). Open sheds/roofs stay
 * walk-through (their columns are thin); buffer stops are small track
 * furniture. Extend here as grand buildings grow. */
export function buildingBoxes(): BuildingBox[] {
  const t = getLine("chennai").stations[8];
  const hx = t.x + 10;
  const hz = t.z + 32;
  const v = getLine("chennai").stations[2];
  return [
    { x: hx, z: hz, yaw: 0, halfW: 18.2, halfL: 8.2, topY: groundHeight(hx, hz) + 5 },
    { x: v.x - 40, z: v.z, yaw: Math.PI / 2, halfW: 18, halfL: 8, topY: groundHeight(v.x - 40, v.z) + 5 },
  ];
}

/** Push bodies out of building walls (skipped when above the roof). Runs
 * after train + station collision for players and bikes alike. */
export function collideBuildings(
  x: number,
  z: number,
  radius: number,
  py: number,
): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (const b of buildingBoxes()) {
    if (py > b.topY - 0.4) continue;
    const dx = px - b.x;
    const dz = pz - b.z;
    const lx = Math.cos(b.yaw) * dx - Math.sin(b.yaw) * dz;
    const lz = Math.sin(b.yaw) * dx + Math.cos(b.yaw) * dz;
    const penX = b.halfW + radius - Math.abs(lx);
    const penZ = b.halfL + radius - Math.abs(lz);
    if (penX > 0 && penZ > 0) {
      if (penX < penZ) {
        const s = lx >= 0 ? 1 : -1;
        const nlx = s * (b.halfW + radius);
        px = b.x + Math.cos(b.yaw) * nlx + Math.sin(b.yaw) * lz;
        pz = b.z - Math.sin(b.yaw) * nlx + Math.cos(b.yaw) * lz;
      } else {
        const s = lz >= 0 ? 1 : -1;
        const nlz = s * (b.halfL + radius);
        px = b.x + Math.cos(b.yaw) * lx + Math.sin(b.yaw) * nlz;
        pz = b.z - Math.sin(b.yaw) * lx + Math.cos(b.yaw) * nlz;
      }
    }
  }
  return { x: px, z: pz };
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
    const n = getLine(lineId).def.coachCount;
    for (let i = 1; i <= n; i++) {
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

/** Visible-track bounds + dead-end walls for a line. The rendered
 * ballast/rails/sleepers run wall-to-wall (just past both platform ends);
 * the 120 m sim stubs beyond exist only so car offsets never clamp and are
 * never drawn, so dead ends read clean with a buffer-stop wall. */
export interface EndWall {
  x: number;
  z: number;
  yaw: number;
}

export function lineRenderBounds(lineId: string): { s0: number; s1: number } {
  const line = getLine(lineId);
  const platLen = consistLength(line.def.coachCount) + 30;
  let s0 = line.stations[0].s - platLen / 2 - 4;
  let s1 = line.stations[line.stations.length - 1].s + platLen / 2 + 4;
  // Never float track/walls on water (e.g. Kanniyakumari runs to the sea):
  // walk each bound back toward its station until the ground is land
  // (ocean plane at y=0.3 vs ~2 m land plate), but never into the zone
  // dwelling consists reach (head extremes + 4 m).
  for (let k = 0; k < 12; k++) {
    const p = trackPointAt(lineId, s0);
    if (groundHeight(p.x, p.z) >= 1.0) break;
    s0 += 5;
  }
  for (let k = 0; k < 12; k++) {
    const p = trackPointAt(lineId, s1);
    if (groundHeight(p.x, p.z) >= 1.0) break;
    s1 -= 5;
  }
  s0 = Math.min(s0, line.headMin - 4);
  s1 = Math.max(s1, line.headMax + 4);
  return { s0, s1 };
}

export function lineEndWalls(lineId: string): EndWall[] {
  const b = lineRenderBounds(lineId);
  const a = trackPointAt(lineId, b.s0);
  const c = trackPointAt(lineId, b.s1);
  return [
    { x: a.x, z: a.z, yaw: a.yaw },
    { x: c.x, z: c.z, yaw: c.yaw },
  ];
}

// --- 2D maps ---

/** Sparse polylines + stations + live markers for every line. */
export interface RailwayMapData {
  lines: { path: { x: number; z: number }[]; stations: { name: string; x: number; z: number }[]; color: string }[];
  trains: { x: number; z: number }[];
}

/** Back-compat shape for the previous single-line renderer. */export function getRailwayMapData(): RailwayMapData {
  const lines = getLines().map((r) => {
    // Draw wall-to-wall (no sim stubs past the dead ends).
    const { s0, s1 } = lineRenderBounds(r.def.id);
    const path: { x: number; z: number }[] = [];
    const steps = 80;
    for (let k = 0; k <= steps; k++) {
      const p = trackPointAt(r.def.id, s0 + ((s1 - s0) * k) / steps);
      path.push({ x: p.x, z: p.z });
    }
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

// --- Spawn safety: district land, never station premises ---

/** Nearest rail distance² from a point (dense path samples, strided). */
function nearestRailDistSq(x: number, z: number): number {
  let best = Infinity;
  for (const r of getLines()) {
    const pts = r.path;
    for (let i = 0; i < pts.length; i += 4) {
      const dx = x - pts[i].x;
      const dz = z - pts[i].z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
  }
  return best;
}

/** Spiral-search the nearest open ground at least `minClear` meters from
 * any rail (stations included — their tracks count too). Spawn pickers,
 * boot and respawn all route through this so riders always land on plain
 * district land, clear of platforms, rails and dwelling consists. */
export function clearGroundSpot(
  x: number,
  z: number,
  minClear = 25,
  maxR = 300,
): { x: number; z: number } {
  const minSq = minClear * minClear;
  if (nearestRailDistSq(x, z) >= minSq) return { x, z };
  let fallback = { x, z };
  let fallbackD = -1;
  const radii = [15, 30, 45, 60, 90, 120, 160, 200, 260];
  for (const r of radii) {
    if (r > maxR) break;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const cx = x + Math.cos(a) * r;
      const cz = z + Math.sin(a) * r;
      const d = nearestRailDistSq(cx, cz);
      if (d >= minSq) return { x: cx, z: cz };
      if (d > fallbackD) {
        fallbackD = d;
        fallback = { x: cx, z: cz };
      }
    }
  }
  return fallback;
}
