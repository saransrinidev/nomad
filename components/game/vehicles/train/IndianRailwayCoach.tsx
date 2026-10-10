// IndianRailwayCoach — reusable blue ICF-style general passenger coach.
// Visual-only: simulation, collision, boarding and prompts stay in
// lib/game/map/railway.ts + Train.tsx (unchanged constants: 4 m wide,
// floor top 0.95, doorways at z ±4.5, seat/berth anchors preserved).
//
// Cost control for integrated graphics: static parts are merged into a
// few vertex-colored meshes (one draw call each), materials/textures are
// module singletons. Per coach: ~19 draw calls (shell, dark, interior,
// glass, roof, 4 door leaves + glass, lettering, decals, lights).

"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { COACH_LEN, carLocal, getLiveCars } from "@/lib/game/map/railway";
import type { GameWorld } from "@/lib/game/state";
import {
  COACH_COLORS,
  coachMaterials,
  grimeTexture,
  mergeParts,
  sideLetteringTexture,
  windowGlassTexture,
  type PartSpec,
} from "./IndianRailwayCoachMaterials";

export interface IndianRailwayCoachProps {
  /** Show tail lamp (last coach of the consist). */
  last?: boolean;
  lineId: string;
  carIndex: number;
  coachNumber?: string;
  worldRef: React.RefObject<GameWorld | null>;
  /** Full length in meters (collision assumes the default 12). */
  length?: number;
  /** Full width in meters (collision assumes the default 4). */
  width?: number;
  /** Force the roof visible/hidden (auto-hides when the player is inside). */
  roofVisible?: boolean;
}

const C = COACH_COLORS;
const DOOR_AT = 4.5;
const DOOR_HALF_W = 0.925;
const WIN_CENTERS = [-2.6, -1.3, 0, 1.3, 2.6];
const WIN_W = 1.1;
const GLASS_LO = 1.86;
const GLASS_HI = 2.62;

// ---------------------------------------------------------------- shell ---

function shellParts(HL: number): PartSpec[] {
  const parts: PartSpec[] = [];
  const T = 0.12; // wall thickness
  for (const sx of [1, -1]) {
    const x = sx * (2 - T / 2);
    const segs: Array<[number, number]> = [
      [-HL, -DOOR_AT - 0.9],
      [-DOOR_AT + 0.9, DOOR_AT - 0.9],
      [DOOR_AT + 0.9, HL],
    ];
    for (const [z0, z1] of segs) {
      const len = z1 - z0;
      if (len <= 0.01) continue;
      const zc = (z0 + z1) / 2;
      // Lower deep-blue panels (floor 0.8 → 1.62).
      parts.push({ p: [x, 1.21, zc], s: [T, 0.82, len], c: C.deepBlue });
      // Cream sill stripe.
      parts.push({ p: [x, 1.7, zc], s: [T, 0.16, len], c: C.cream });
      // Cream waist stripe on the lower body.
      parts.push({ p: [x, 1.08, zc], s: [T + 0.015, 0.12, len], c: C.cream });
      // Top rail (turquoise).
      parts.push({ p: [x, 2.79, zc], s: [T, 0.14, len], c: C.turquoise });
      // Upper frieze (turquoise dark, carries the number boards).
      parts.push({ p: [x, 2.99, zc], s: [T, 0.26, len], c: C.turquoiseDark });
    }
    // Window band pillars between the openings (turquoise).
    const openings = WIN_CENTERS.map((z) => [z - WIN_W / 2, z + WIN_W / 2]);
    const band: Array<[number, number]> = [];
    let cur = -DOOR_AT + 0.9;
    for (const [o0, o1] of openings) {
      band.push([cur, o0]);
      cur = o1;
    }
    band.push([cur, DOOR_AT - 0.9]);
    for (const [z0, z1] of band) {
      const len = z1 - z0;
      if (len <= 0.02) continue;
      parts.push({ p: [x, 2.25, (z0 + z1) / 2], s: [T, 0.94, len], c: C.turquoise });
    }
    // Window frames: sill / head / side posts (turquoise dark).
    for (const z of WIN_CENTERS) {
      parts.push({ p: [x, GLASS_LO - 0.04, z], s: [T + 0.02, 0.08, WIN_W + 0.16], c: C.turquoiseDark });
      parts.push({ p: [x, GLASS_HI + 0.04, z], s: [T + 0.02, 0.08, WIN_W + 0.16], c: C.turquoiseDark });
      for (const dz of [-WIN_W / 2 - 0.04, WIN_W / 2 + 0.04]) {
        parts.push({ p: [x, (GLASS_LO + GLASS_HI) / 2, z + dz], s: [T + 0.02, GLASS_HI - GLASS_LO + 0.16, 0.08], c: C.turquoiseDark });
      }
    }
    // Door frame posts (2.1 m clear) + header track + frieze lintel.
    for (const zc of [-DOOR_AT, DOOR_AT]) {
      for (const dz of [-0.95, 0.95]) {
        parts.push({ p: [x, 2.0, zc + dz], s: [T + 0.02, 2.1, 0.12], c: C.turquoise });
      }
      parts.push({ p: [x, 3.04, zc], s: [T + 0.04, 0.1, 2.1], c: C.steelDark });
      parts.push({ p: [x, 2.99, zc], s: [T, 0.26, 1.9], c: C.turquoiseDark });
      // Threshold plate.
      parts.push({ p: [x, 0.9, zc], s: [0.3, 0.08, 1.9], c: C.steel });
      // Grab rails (yellow) flanking the doorway, clear of the sliding leaf.
      for (const dz of [-1.05, 1.05]) {
        parts.push({ p: [sx * 2.18, 1.6, zc + dz], s: [0.05, 2.1, 0.05], c: C.railYellow, cyl: true });
      }
    }
    // Skirt apron below the floor.
    parts.push({ p: [sx * 1.9, 0.55, 0], s: [0.08, 0.5, HL * 2 - 0.4], c: C.deepBlueDark });
  }
  // End walls (deep blue) with gangway opening 1.1 wide.
  for (const sz of [1, -1]) {
    const z = sz * (HL - 0.06);
    for (const sx of [-1.245, 1.245]) {
      parts.push({ p: [sx, 1.96, z], s: [1.39, 2.32, 0.12], c: C.deepBlue });
    }
    parts.push({ p: [0, 2.985, z], s: [3.88, 0.27, 0.12], c: C.deepBlue });
    // Gangway bellows ribs + closed gangway door.
    for (let i = 0; i < 3; i++) {
      parts.push({ p: [0, 1.9, z + sz * (0.08 + i * 0.05)], s: [1.2 - i * 0.06, 2.0, 0.04], c: C.underBlack });
    }
    // End grab handles.
    for (const sx of [-0.8, 0.8]) {
      parts.push({ p: [sx, 1.9, z + sz * 0.1], s: [0.05, 1.2, 0.05], c: C.railYellow, cyl: true });
    }
  }
  return parts;
}

// ------------------------------------------------------------ underframe ---

function darkParts(HL: number): PartSpec[] {
  const parts: PartSpec[] = [];
  // Floor slab (top at 0.95 to match COACH_FLOOR_Y).
  parts.push({ p: [0, 0.875, 0], s: [3.9, 0.15, HL * 2], c: C.floorBrown });
  // Center sill + cross members.
  parts.push({ p: [0, 0.6, 0], s: [0.3, 0.3, HL * 2 - 1], c: C.underBlack });
  for (const z of [-4, -2, 0, 2, 4]) {
    parts.push({ p: [0, 0.62, z], s: [2.6, 0.18, 0.18], c: C.underBlack });
  }
  // Battery boxes + air reservoir + brake rod.
  for (const sx of [-0.9, 0.9]) {
    parts.push({ p: [sx, 0.5, 1.5], s: [0.7, 0.4, 1.0], c: C.underBlack });
  }
  parts.push({ p: [0.6, 0.45, -1.8], s: [0.35, 0.35, 1.4], c: C.steelDark, cyl: true, r: [Math.PI / 2, 0, 0] });
  parts.push({ p: [0, 0.35, 0], s: [0.06, 0.06, HL * 2 - 2], c: C.steelDark, cyl: true, r: [Math.PI / 2, 0, 0] });
  // ICF bogies: side frames, axle boxes, axles, wheels, springs, bolster.
  for (const bz of [-HL / 2 - 1, HL / 2 + 1]) {
    for (const sx of [-1.05, 1.05]) {
      parts.push({ p: [sx, 0.55, bz], s: [0.22, 0.5, 2.6], c: C.underBlack });
      for (const dz of [-0.75, 0.75]) {
        parts.push({ p: [sx, 0.62, bz + dz], s: [0.3, 0.34, 0.4], c: C.steelDark });
      }
      // Coil spring + seats.
      parts.push({ p: [sx, 0.92, bz], s: [0.3, 0.08, 0.5], c: C.steelDark });
      parts.push({ p: [sx, 0.72, bz], s: [0.16, 0.32, 0.16], c: C.steel, cyl: true });
      parts.push({ p: [sx, 0.5, bz], s: [0.3, 0.08, 0.5], c: C.steelDark });
    }
    parts.push({ p: [0, 0.98, bz], s: [2.0, 0.22, 1.4], c: C.underBlack });
    for (const dz of [-0.75, 0.75]) {
      // Axle + one wheel per side, riding on the rails at ±0.85.
      parts.push({ p: [0, 0.8, bz + dz], s: [0.14, 1.9, 0.14], c: C.steelDark, cyl: true, r: [0, 0, Math.PI / 2] });
      for (const sx of [-0.85, 0.85]) {
        parts.push({ p: [sx, 0.8, bz + dz], s: [0.46, 0.14, 0.46], c: "#2b2e34", cyl: true, r: [0, 0, Math.PI / 2] });
        parts.push({ p: [sx, 0.42, bz + dz + 0.3], s: [0.08, 0.3, 0.12], c: C.underBlack });
      }
    }
  }
  // Steps below each doorway (3 treads).
  for (const sx of [1, -1]) {
    for (const zc of [-DOOR_AT, DOOR_AT]) {
      const steps: Array<[number, number]> = [
        [2.15, 0.68],
        [2.3, 0.43],
        [2.45, 0.18],
      ];
      for (const [x, y] of steps) {
        parts.push({ p: [sx * x, y, zc], s: [0.34, 0.07, 1.6], c: C.steelDark });
      }
    }
  }
  // Bridge plates spanning the platform gap at each doorway.
  for (const sx of [1, -1]) {
    for (const zc of [-DOOR_AT, DOOR_AT]) {
      parts.push({ p: [sx * 2.45, 0.9, zc], s: [1.1, 0.1, 1.8], c: "#8d939c" });
    }
  }
  // Couplers + air hoses + buffer beams at both ends.
  for (const sz of [1, -1]) {
    parts.push({ p: [0, 0.7, sz * (HL + 0.4)], s: [0.25, 0.25, 0.9], c: C.underBlack });
    parts.push({ p: [0.15, 0.7, sz * (HL + 0.85)], s: [0.3, 0.3, 0.25], c: C.steelDark });
    for (const sx of [-0.3, 0.3]) {
      parts.push({ p: [sx, 0.55, sz * (HL + 0.25)], s: [0.05, 0.4, 0.05], c: C.underBlack, cyl: true });
    }
    parts.push({ p: [0, 0.75, sz * (HL - 0.02)], s: [3.4, 0.35, 0.15], c: C.deepBlueDark });
  }
  // Roof-access ladder at one end.
  for (const sx of [-0.3, 0.3]) {
    parts.push({ p: [sx, 2.0, HL + 0.1], s: [0.05, 2.2, 0.05], c: C.steelDark, cyl: true });
  }
  for (let i = 0; i < 5; i++) {
    parts.push({ p: [0, 1.1 + i * 0.45, HL + 0.1], s: [0.6, 0.05, 0.05], c: C.steelDark, cyl: true, r: [0, 0, Math.PI / 2] });
  }
  return parts;
}

// -------------------------------------------------------------- interior ---

function interiorParts(HL: number): PartSpec[] {
  const parts: PartSpec[] = [];
  for (const sx of [1, -1]) {
    const x = sx * 1.87;
    // Cream wall liner with a blue dado strip (door gaps left open).
    const segs: Array<[number, number]> = [
      [-HL + 0.1, -DOOR_AT - 0.9],
      [-DOOR_AT + 0.9, DOOR_AT - 0.9],
      [DOOR_AT + 0.9, HL - 0.1],
    ];
    for (const [z0, z1] of segs) {
      const len = z1 - z0;
      if (len <= 0.01) continue;
      const zc = (z0 + z1) / 2;
      parts.push({ p: [x, 1.85, zc], s: [0.04, 1.7, len], c: C.interiorCream });
      parts.push({ p: [x, 1.15, zc], s: [0.045, 0.35, len], c: C.interiorBlue });
    }
    // Longitudinal wooden benches (seat top 1.5 = SEAT_TOP_Y).
    parts.push({ p: [sx * 1.4, 1.44, 0], s: [0.8, 0.12, 6.4], c: C.wood });
    parts.push({ p: [sx * 1.84, 1.75, 0], s: [0.1, 0.55, 6.4], c: C.wood });
    parts.push({ p: [sx * 1.84, 2.06, 0], s: [0.14, 0.1, 6.4], c: C.woodDark });
    for (const z of [-2.4, 0, 2.4]) {
      parts.push({ p: [sx * 1.4, 1.15, z], s: [0.6, 0.5, 0.12], c: C.woodDark });
    }
    // Luggage racks above the benches.
    for (const dx of [-0.2, 0, 0.2]) {
      parts.push({ p: [sx * (1.5 + dx), 2.58, 0], s: [0.06, 0.04, 6.0], c: C.steel });
    }
    for (const z of [-2.5, 0, 2.5]) {
      parts.push({ p: [sx * 1.5, 2.45, z], s: [0.5, 0.22, 0.06], c: C.steelDark });
    }
  }
  // Ceiling panel (fades with the roof so the cabin reads from above).
  // (Fans live in roofParts for the same reason.)
  // Side upper berth at the berth anchor (-1.1, +2.8, top 1.7).
  parts.push({ p: [-1.1, 1.61, 2.8], s: [0.9, 0.18, 2.0], c: C.wood });
  parts.push({ p: [-1.1, 1.74, 2.8], s: [0.8, 0.08, 1.9], c: "#d8d2c2" });
  for (const dz of [1.95, 3.65]) {
    parts.push({ p: [-1.1, 1.3, dz], s: [0.8, 0.6, 0.08], c: C.steelDark });
  }
  return parts;
}

// ------------------------------------------------------------------ roof ---

function roofParts(HL: number): PartSpec[] {
  const parts: PartSpec[] = [];
  // Faceted arch from flat panels (facets read as roof seams).
  const R = 4;
  const cy = 3.1 - R * Math.cos(Math.PI / 6);
  for (let i = -4; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 6);
    parts.push({
      p: [R * Math.sin(a), cy + R * Math.cos(a), 0],
      s: [0.62, 0.06, HL * 2 - 0.3],
      c: i % 2 === 0 ? C.roofGrey : C.roofDark,
      r: [0, 0, -a],
    });
  }
  // End caps stepping down the arch.
  for (const sz of [1, -1]) {
    parts.push({ p: [0, 3.2, sz * (HL - 0.15)], s: [3.9, 0.22, 0.12], c: C.roofDark });
    parts.push({ p: [0, 3.4, sz * (HL - 0.15)], s: [3.0, 0.2, 0.12], c: C.roofGrey });
    parts.push({ p: [0, 3.55, sz * (HL - 0.15)], s: [1.6, 0.16, 0.12], c: C.roofDark });
  }
  // Roof vents.
  for (const z of [-3, 0, 3]) {
    parts.push({ p: [0, 3.68, z], s: [0.5, 0.14, 0.8], c: C.roofDark });
  }
  // Ceiling panel + fans fade with the roof (else they'd block the view).
  parts.push({ p: [0, 3.02, 0], s: [3.6, 0.06, HL * 2 - 0.4], c: C.interiorCream });
  for (const z of [-2.5, 2.5]) {
    parts.push({ p: [0, 2.85, z], s: [0.09, 0.18, 0.09], c: C.underBlack, cyl: true });
    for (let b = 0; b < 3; b++) {
      const a = (b / 3) * Math.PI * 2;
      parts.push({
        p: [Math.cos(a) * 0.35, 2.78, z + Math.sin(a) * 0.35],
        s: [0.65, 0.02, 0.14],
        c: C.steelDark,
        r: [0, -a, 0],
      });
    }
  }
  return parts;
}

// ------------------------------------------------------------- door leaf ---

function doorLeafParts(): PartSpec[] {
  const W = DOOR_HALF_W * 2; // 1.85
  return [
    // Sliding panel: 2.05 m tall (0.95–3.0 clear opening).
    { p: [0, 1.975, 0], s: [0.08, 2.05, W], c: C.deepBlue },
    // Dark window inset + steel bars over it.
    { p: [0, 2.5, 0], s: [0.07, 0.7, 0.62], c: C.glassDark },
    { p: [0, 2.36, 0], s: [0.11, 0.045, 0.62], c: C.steel },
    { p: [0, 2.5, 0], s: [0.11, 0.045, 0.62], c: C.steel },
    { p: [0, 2.64, 0], s: [0.11, 0.045, 0.62], c: C.steel },
    // Yellow safety edge + recessed handle.
    { p: [0, 1.975, W / 2 - 0.04], s: [0.09, 2.05, 0.07], c: C.railYellow },
    { p: [0, 1.7, -W / 2 + 0.12], s: [0.1, 0.08, 0.18], c: C.underBlack },
    // Lower kick plate.
    { p: [0, 1.1, 0], s: [0.09, 0.2, W - 0.1], c: C.deepBlueDark },
  ];
}

// ================================================================ component ===

const DOORWAYS: Array<{ sx: 1 | -1; zc: number }> = [
  { sx: 1, zc: -DOOR_AT },
  { sx: 1, zc: DOOR_AT },
  { sx: -1, zc: -DOOR_AT },
  { sx: -1, zc: DOOR_AT },
];

export default function IndianRailwayCoach({
  last = false,
  lineId,
  carIndex,
  coachNumber = "08206",
  worldRef,
  length = COACH_LEN,
  width = 4,
  roofVisible = true,
}: IndianRailwayCoachProps) {
  const HL = length / 2;
  const HW = width / 2;
  const mats = useMemo(() => coachMaterials(), []);

  const shellGeo = useMemo(() => mergeParts(shellParts(HL)), [HL]);
  const darkGeo = useMemo(() => mergeParts(darkParts(HL)), [HL]);
  const interiorGeo = useMemo(() => mergeParts(interiorParts(HL)), [HL]);
  const roofGeo = useMemo(() => mergeParts(roofParts(HL)), [HL]);
  const leafGeo = useMemo(() => mergeParts(doorLeafParts()), []);
  // Merged ceiling light strips (one mesh, faded with the roof).
  const lampGeo = useMemo(
    () =>
      mergeParts([
        { p: [-0.7, 2.96, 0], s: [0.3, 0.06, 8], c: "#fff6dc" },
        { p: [0.7, 2.96, 0], s: [0.3, 0.06, 8], c: "#fff6dc" },
      ]),
    [],
  );

  // Merged window glass (keeps UVs for the rounded-corner texture).
  const glassGeo = useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    for (const sx of [1, -1]) {
      for (const z of WIN_CENTERS) {
        const g = new THREE.PlaneGeometry(WIN_W - 0.04, GLASS_HI - GLASS_LO);
        g.applyMatrix4(new THREE.Matrix4().makeRotationY(sx * Math.PI * 0.5));
        g.translate(sx * (HW - 0.01), (GLASS_LO + GLASS_HI) / 2, z);
        geos.push(g);
      }
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) throw new Error("coach glass merge failed");
    return merged;
  }, [HW]);

  // One shared leaf window-glass plane.
  const leafGlassGeo = useMemo(() => new THREE.PlaneGeometry(0.6, 0.6), []);

  // Door leaves (slide toward the car center when the train is stopped).
  // The roof of the specific car the player is inside fades transparent
  // (not hidden) so the cabin reads from the third-person camera while
  // roaming. No React state in the loop.
  const roofRef = useRef<THREE.Group>(null!);
  const roofArchRef = useRef<THREE.Mesh>(null!);
  const roofMatRef = useRef<THREE.MeshStandardMaterial>(null!);
  const lampMatRef = useRef<THREE.MeshStandardMaterial>(null!);
  const roofOpacity = useRef(1);
  const doorRefs = useRef<Array<THREE.Group | null>>([]);
  const doorSlide = useRef<number[]>([0, 0, 0, 0]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const world = worldRef.current;
    if (!world || world.paused) return;
    const tr = world.trains.find((t) => t.line === lineId);
    const stopped = !!tr && tr.wait > 0;
    DOORWAYS.forEach((d, i) => {
      const target = stopped ? -Math.sign(d.zc) * 1.8 : 0;
      const cur = doorSlide.current[i] + (target - doorSlide.current[i]) * Math.min(1, dt * 3);
      doorSlide.current[i] = cur;
      const g = doorRefs.current[i];
      if (g) g.position.z = d.zc + cur;
    });
    // Fade this car's roof while the rider is inside it.
    const cars = getLiveCars(lineId);
    const c = cars[carIndex];
    let inside = false;
    if (c) {
      const local = carLocal(c, world.playerPos.x, world.playerPos.z);
      inside = Math.abs(local.lx) < HW + 0.2 && Math.abs(local.lz) < HL + 0.2;
    }
    const showRoof = roofVisible && !inside;
    const cur = roofOpacity.current + ((showRoof ? 1 : 0.12) - roofOpacity.current) * Math.min(1, dt * 5);
    roofOpacity.current = cur;
    if (roofMatRef.current) {
      roofMatRef.current.opacity = cur;
      roofMatRef.current.depthWrite = cur > 0.6;
    }
    if (lampMatRef.current) lampMatRef.current.opacity = cur;
    if (roofArchRef.current) roofArchRef.current.castShadow = cur > 0.6;
    if (roofRef.current) roofRef.current.visible = roofVisible && cur > 0.02;
  });

  const glassTex = useMemo(() => windowGlassTexture(), []);
  const letterTex = useMemo(() => sideLetteringTexture(coachNumber), [coachNumber]);
  const grimeA = useMemo(() => grimeTexture(1), []);
  const grimeB = useMemo(() => grimeTexture(2), []);

  const glassMat = useMemo(() => {
    const m = mats.glass.clone();
    if (glassTex) {
      m.map = glassTex;
      m.needsUpdate = true;
    }
    return m;
  }, [mats, glassTex]);

  return (
    <group>
      {/* Merged static masses (no passengers — NPCs come later) */}
      <mesh geometry={shellGeo} material={mats.paint} castShadow receiveShadow />
      <mesh geometry={darkGeo} material={mats.dark} />
      <mesh geometry={interiorGeo} material={mats.paint} />
      {/* Window glass (one merged mesh, rounded-corner alpha texture) */}
      <mesh geometry={glassGeo} material={glassMat} />
      {/* Sliding doorway leaves + their window glass */}
      {DOORWAYS.map((d, i) => (
        <group
          key={`${d.sx}:${d.zc}`}
          ref={(g) => {
            doorRefs.current[i] = g;
          }}
          position={[d.sx * (HW + 0.07), 0, d.zc]}
        >
          <mesh geometry={leafGeo} material={mats.paint} castShadow />
          <mesh geometry={leafGlassGeo} material={mats.glass} position={[d.sx * 0.065, 2.5, 0]} rotation-y={d.sx * Math.PI * 0.5} />
        </group>
      ))}
      {/* Roof + ceiling (fade transparent for the occupied car only) */}
      <group ref={roofRef}>
        <mesh ref={roofArchRef} geometry={roofGeo} castShadow>
          <meshStandardMaterial
            ref={roofMatRef}
            vertexColors
            metalness={0.35}
            roughness={0.55}
            transparent
          />
        </mesh>
        <mesh geometry={lampGeo}>
          <meshStandardMaterial
            ref={lampMatRef}
            color="#fff6dc"
            emissive="#ffeeb8"
            emissiveIntensity={3.2}
            transparent
          />
        </mesh>
      </group>
      {/* Coach number + railway markings, both sides */}
      {letterTex &&
        [1, -1].map((sx) => (
          <mesh key={sx} position={[sx * (HW + 0.075), 2.99, 0]} rotation-y={sx * Math.PI * 0.5}>
            <planeGeometry args={[3.6, 0.24]} />
            <meshStandardMaterial map={letterTex} transparent roughness={0.5} metalness={0.1} />
          </mesh>
        ))}
      {/* Weathering decals (transparent grime/rust, no geometry cost) */}
      {[grimeA, grimeB].map(
        (tex, ti) =>
          tex &&
          [1, -1].map((sx) => (
            <mesh
              key={`${ti}:${sx}`}
              position={[sx * (HW + 0.07), 0.95, ti === 0 ? -1.8 : 2.2]}
              rotation-y={sx * Math.PI * 0.5}
            >
              <planeGeometry args={[3.2, 1.0]} />
              <meshStandardMaterial map={tex} transparent depthWrite={false} roughness={0.9} metalness={0} />
            </mesh>
          )),
      )}
      {/* Tail lamp on the last coach */}
      {last && (
        <mesh position={[0, 2.4, -HL - 0.06]} material={mats.tailRed}>
          <boxGeometry args={[0.5, 0.4, 0.1]} />
        </mesh>
      )}
    </group>
  );
}
