// Static railway infrastructure for every line: instanced ballast + twin
// rails + sleepers along each curve, plus a platform, shelter, sign board,
// benches and lamps at each station. Purely presentational; moving consists
// live in Train.tsx. Heights follow groundHeight so track sits on terrain.

"use client";

import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { getLine, getLines, lineDeparture, lineEndWalls, lineRenderBounds, OPEN_PLATFORM_FACES, railBridgeSpans, railSurfaceY, trackDeckAt, trackPointAt } from "@/lib/game/map/railway";
import { consistLength } from "@/lib/game/map/railway";
import { groundHeight } from "@/lib/game/map/terrain";
import { formatTime } from "@/lib/game/map/time";
import type { GameWorld } from "@/lib/game/state";

const BALLAST_W = 4.5;
const RAIL_GAUGE = 0.85; // half-gauge: rails at ±0.85 m
// Short segments so ballast/rail chords follow tight corners instead of
// cutting across them (still 3 instanced draw calls total).
const PIECE_LEN = 20; // ballast/rail segment length

const signCache = new Map<string, THREE.CanvasTexture | null>();

// Brushed-steel PBR set for the rails (public/texture/Metal005). Each rail
// piece is a unit box stretched ~20 m, so the texture repeats along its
// length (v) to keep the grain dense instead of smeared.
const RAIL_REPEAT: [number, number] = [1, 24];

function useRailMetalTextures() {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    const loader = new THREE.TextureLoader();
    const setup = (url: string, srgb: boolean) => {
      const tex = loader.load(url);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(RAIL_REPEAT[0], RAIL_REPEAT[1]);
      if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      return tex;
    };
    return {
      map: setup("/texture/Metal005/Metal005_baseColor.webp", true),
      metalnessMap: setup("/texture/Metal005/Metal005_metallic.webp", false),
      roughnessMap: setup("/texture/Metal005/Metal005_roughness.webp", false),
      normalMap: setup("/texture/Metal005/Metal005_normal.webp", false),
    };
  }, []);
}

function stationSignTexture(text: string): THREE.CanvasTexture | null {
  if (signCache.has(text)) return signCache.get(text)!;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#14307f";
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = "#f5c518";
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${text.length > 10 ? 40 : 56}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  signCache.set(text, tex);
  return tex;
}

interface Piece {
  x: number;
  y: number;
  z: number;
  yaw: number;
  len: number;
}

function useTrackPieces() {
  return useMemo(() => {
    const pieces: Piece[] = [];
    const sleepers: { x: number; y: number; z: number; yaw: number }[] = [];
    const piers: { x: number; y: number; z: number; yaw: number; len: number }[] = [];
    for (const line of getLines()) {
      // Visible track runs wall-to-wall only — the sim stubs past the
      // buffer stops are never drawn (no stray rails at dead ends).
      const { s0, s1 } = lineRenderBounds(line.def.id);
      const span = Math.max(1, s1 - s0);
      const n = Math.max(1, Math.round(span / PIECE_LEN));
      for (let i = 0; i < n; i++) {
        const a0 = s0 + (i / n) * span;
        const a1 = s0 + ((i + 1) / n) * span;
        const p0 = trackPointAt(line.def.id, a0);
        const p1 = trackPointAt(line.def.id, a1);
        const mx = (p0.x + p1.x) / 2;
        const mz = (p0.z + p1.z) / 2;
        // Deck datum: rides over water on bridges instead of the seabed.
        const my = (trackDeckAt(line.def.id, a0) + trackDeckAt(line.def.id, a1)) / 2;
        pieces.push({
          x: mx,
          y: my,
          z: mz,
          yaw: Math.atan2(p1.x - p0.x, p1.z - p0.z),
          len: Math.hypot(p1.x - p0.x, p1.z - p0.z) + 0.6,
        });
      }
      const count = Math.floor(span / 3);
      for (let i = 0; i < count; i++) {
        const s = s0 + i * 3 + 1.5;
        const p = trackPointAt(line.def.id, s);
        sleepers.push({ x: p.x, y: trackDeckAt(line.def.id, s) + 0.14, z: p.z, yaw: p.yaw });
      }
    }
    // Trestle piers wherever the deck flies over water (Pamban strait…).
    for (const b of railBridgeSpans()) {
      const len = b.top - b.bot + 1; // embedded 1 m into the seabed
      piers.push({ x: b.x, y: (b.top + b.bot - 1) / 2, z: b.z, yaw: 0, len });
    }
    return { pieces, sleepers, piers };
  }, []);
}

function useFillInstances(
  ref: RefObject<THREE.InstancedMesh | null>,
  items: { x: number; y: number; z: number; yaw: number; len?: number; dx?: number; dz?: number }[],
  baseLen: number,
) {
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      dummy.position.set(it.x + (it.dx ?? 0), it.y, it.z + (it.dz ?? 0));
      dummy.rotation.set(0, it.yaw, 0);
      dummy.scale.set(1, 1, (it.len ?? baseLen) / baseLen);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [ref, items, baseLen]);
}

// LED departure board: live timetable texture (line title, status, next
// three stops with clock ETAs), refreshed 2×/s and only near the player.
function drawDepartureBoard(
  canvas: HTMLCanvasElement,
  lineId: string,
  world: GameWorld,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const line = getLine(lineId);
  const tr = world.trains.find((t) => t.line === lineId);
  const info = tr
    ? lineDeparture(lineId, tr, world.time)
    : { title: line.def.title.toUpperCase(), status: "—", upcoming: [] };
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = "#070707";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = line.def.color;
  ctx.fillRect(0, 0, W, 10);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 25px monospace";
  ctx.fillText(info.title.slice(0, 27), 18, 34);
  // Amber LED status line with glow.
  ctx.font = "bold 33px monospace";
  ctx.fillStyle = "#ffb000";
  ctx.shadowColor = "rgba(255,176,0,0.8)";
  ctx.shadowBlur = 10;
  ctx.fillText(info.status.slice(0, 22), 18, 82);
  ctx.shadowBlur = 0;
  // Next stops: green clock + white name.
  ctx.font = "bold 27px monospace";
  info.upcoming.forEach((u, i) => {
    const y = 138 + i * 38;
    ctx.fillStyle = "#39ff6a";
    ctx.fillText(u.etaClock, 18, y);
    ctx.fillStyle = "#e8e8e8";
    ctx.fillText(u.name.slice(0, 13), 148, y);
  });
  // Live clock footer.
  ctx.font = "bold 20px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.textAlign = "right";
  ctx.fillText(formatTime(world.time), W - 16, H - 18);
  ctx.textAlign = "left";
}

function DepartureBoard({
  lineId,
  index,
  worldRef,
}: {
  lineId: string;
  index: number;
  worldRef: RefObject<GameWorld>;
}) {
  const st = getLine(lineId).stations[index];
  const canvas = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    return c;
  }, []);
  const tex = useMemo(() => {
    if (!canvas) return null;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [canvas]);
  const acc = useRef(0);
  const drawn = useRef(false);
  useFrame((_, dt) => {
    if (!canvas || !tex) return;
    const world = worldRef.current;
    if (!world) return;
    if (world.paused && drawn.current) return;
    acc.current += dt;
    if (drawn.current && acc.current < 0.5) return;
    acc.current = 0;
    // Only nearby boards stay live (17 stations × texture uploads).
    const fx = world.mode === "ride" ? world.bikePos.x : world.playerPos.x;
    const fz = world.mode === "ride" ? world.bikePos.z : world.playerPos.z;
    if (drawn.current && Math.hypot(fx - st.x, fz - st.z) > 250) return;
    drawDepartureBoard(canvas, lineId, world);
    tex.needsUpdate = true;
    drawn.current = true;
  });
  if (!tex) return null;
  // Platform-local: near the track edge, clear of shelter/benches/lamps.
  return (
    <group position={[-1.8, 0, -11]} rotation-y={-Math.PI / 2}>
      {[-0.9, 0.9].map((dx) => (
        <mesh key={dx} position={[dx, 1.9, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 1.9, 6]} />
          <meshStandardMaterial color="#2c2f34" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 2.9, 0]} castShadow>
        <boxGeometry args={[2.9, 1.7, 0.2]} />
        <meshStandardMaterial color="#111111" roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.9, 0.12]}>
        <planeGeometry args={[2.7, 1.35]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Station({ lineId, index, bare = false, numberBoard, canopy = false, worldRef }: { lineId: string; index: number; bare?: boolean; numberBoard?: string; canopy?: boolean; worldRef?: RefObject<GameWorld> }) {
  const line = getLine(lineId);
  const st = line.stations[index];
  const sign = useMemo(() => stationSignTexture(st.short), [st.short]);
  const boardTex = useMemo(
    () => (numberBoard ? stationSignTexture(numberBoard) : null),
    [numberBoard],
  );
  // Platform centered on the station point, long enough for the consist.
  const platLen = consistLength(line.def.coachCount) + 30;
  const c = { x: st.x, z: st.z, yaw: st.yaw };
  const gy = groundHeight(c.x, c.z);
  // Right-hand side of travel direction, adjacent to the coach wall
  // (edge ~0.4 m clear of the 2 m half-width shell).
  const rx = Math.cos(c.yaw);
  const rz = -Math.sin(c.yaw);
  const px = c.x + rx * 4.6;
  const pz = c.z + rz * 4.6;

  return (
    <group position={[px, gy, pz]} rotation-y={c.yaw}>
      {/* Platform: top flush with the coach floor (0.95) for level boarding. */}
      <mesh position={[0, 0.475, 0]} receiveShadow>
        <boxGeometry args={[5, 0.95, platLen]} />
        <meshStandardMaterial color="#b0a58e" roughness={1} />
      </mesh>
      <mesh position={[-2.4, 0.97, 0]}>
        <boxGeometry args={[0.3, 0.04, platLen]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.8} />
      </mesh>
      {/* Access stairs at both ends (walkable: +0.32 / +0.63 treads). */}
      {[platLen / 2 + 0.85, -platLen / 2 - 0.85].map((z, si) => (
        <group key={si} position={[0, 0, z]}>
          <mesh position={[0, 0.16, 0]} receiveShadow>
            <boxGeometry args={[3, 0.32, 0.9]} />
            <meshStandardMaterial color="#9a917f" roughness={1} />
          </mesh>
          <mesh position={[0, 0.315, si === 0 ? -0.55 : 0.55]} receiveShadow>
            <boxGeometry args={[3, 0.63, 0.9]} />
            <meshStandardMaterial color="#9a917f" roughness={1} />
          </mesh>
        </group>
      ))}
      {/* Bare platforms (shared termini) skip all trimmings — the grand
      station building covers them. LED boards stay: every platform shows
      live timings. */}
      {worldRef && <DepartureBoard lineId={lineId} index={index} worldRef={worldRef} />}
      {/* Junction number totem: trackside platform number board. Sheds
      (where present) cover the faces, so totem platforms carry no roofs
      of their own; canopy faces get a matching roof strip instead. */}
      {bare && numberBoard && (
        <group position={canopy ? [1.8, 0, 0] : [1.8, 0, -18]}>
          {[-0.6, 0.6].map((dx) => (
            <mesh key={dx} position={[dx, 1.75, 0]}>
              <cylinderGeometry args={[0.06, 0.06, 1.6, 6]} />
              <meshStandardMaterial color="#2c2f34" roughness={0.8} />
            </mesh>
          ))}
          {boardTex && (
            <>
              <mesh position={[0, 2.9, 0.04]}>
                <planeGeometry args={[2.4, 1.0]} />
                <meshStandardMaterial map={boardTex} roughness={0.6} />
              </mesh>
              <mesh position={[0, 2.9, -0.04]} rotation-y={Math.PI}>
                <planeGeometry args={[2.4, 1.0]} />
                <meshStandardMaterial map={boardTex} roughness={0.6} />
              </mesh>
            </>
          )}
        </group>
      )}
      {/* Fan-complex canopy strip: uniform posts + roof over the platform
      (same design language as the sheds). Locos dwell clear of it (roof
      spans ±20 m, loco sits ±33–47 m out); coaches clear it by 1.4 m. */}
      {bare && canopy && (
        <>
          {[-2.2, 2.2].map((x) =>
            [-18, -6, 6, 18].map((z) => (
              <mesh key={`${x}:${z}`} position={[x, 2.95, z]}>
                <cylinderGeometry args={[0.11, 0.13, 4, 8]} />
                <meshStandardMaterial color="#3a3f45" roughness={0.8} />
              </mesh>
            )),
          )}
          <mesh position={[0, 5.1, 0]} castShadow>
            <boxGeometry args={[5.6, 0.25, 40]} />
            <meshStandardMaterial color="#7a3b2e" roughness={0.9} />
          </mesh>
          <mesh position={[0, 4.9, 0]}>
            <boxGeometry args={[5.8, 0.18, 40.2]} />
            <meshStandardMaterial color="#f3e3c2" roughness={0.7} />
          </mesh>
        </>
      )}
      {!bare && (
        <>
          {/* Shelter: posts (no shadow) + roof (casts — the one big shadow) */}
          {[-6, 6].map((z) =>
            [-1.5, 1.5].map((x) => (
              <mesh key={`${x}-${z}`} position={[x, 2.15, z]}>
                <cylinderGeometry args={[0.12, 0.12, 2.4, 8]} />
                <meshStandardMaterial color="#3a3f45" roughness={0.8} />
              </mesh>
            )),
          )}
          <mesh position={[0, 3.6, 0]} castShadow>
            <boxGeometry args={[5.5, 0.25, 15]} />
            <meshStandardMaterial color="#7a3b2e" roughness={0.9} />
          </mesh>
          {/* Benches */}
          {[-3, 3].map((z) => (
            <mesh key={z} position={[0.8, 1.2, z]}>
              <boxGeometry args={[0.6, 0.5, 2.2]} />
              <meshStandardMaterial color="#6b4a2f" roughness={0.9} />
            </mesh>
          ))}
          {/* Name board facing the track */}
          <group position={[-2.6, 0, 0]} rotation-y={-Math.PI / 2}>
            {[-2.4, 2.4].map((x) => (
              <mesh key={x} position={[x, 2.75, 0]}>
                <cylinderGeometry args={[0.09, 0.09, 3.6, 8]} />
                <meshStandardMaterial color="#3a3f45" roughness={0.8} />
              </mesh>
            ))}
            {sign && (
              <mesh position={[0, 3.6, 0]}>
                <planeGeometry args={[6, 1.5]} />
                <meshStandardMaterial map={sign} roughness={0.8} />
              </mesh>
            )}
          </group>
          {/* Lamp posts (beside the platform, on the ground) */}
          {[-14, 14].map((z) => (
            <group key={z} position={[3.2, 0, z]}>
              <mesh position={[0, 3, 0]}>
                <cylinderGeometry args={[0.08, 0.1, 6, 8]} />
                <meshStandardMaterial color="#2c2f34" roughness={0.8} />
              </mesh>
          <mesh position={[0, 6.1, 0]}>
            <boxGeometry args={[0.5, 0.3, 0.5]} />
            <meshStandardMaterial
              color="#fff2c8"
              emissive="#ffe9a8"
              emissiveIntensity={2.2}
            />
          </mesh>
            </group>
          ))}
        </>
      )}
    </group>
  );
}

// Both lines start at Chennai Central: instead of two overlapping station
// buildings, one grand terminus covers them — bare platforms underneath
// (boarding physics untouched), one trainshed roof, one name board,
// platform number signs over each track.
const CHENNAI_TERMINUS_KEYS = new Set(["chennai:0", "western:0"]);
// Trichy junction faces → platform numbers, ordered south to north so
// the row reads 1-2-3-4: R4 (+16), R1 (0), R3 (-14), R6 (-28).
const TRICHY_BOARDS: Record<string, string> = {
  "mannar:0": "1",
  "chennai:8": "2",
  "southern:2": "3",
  "kongu:4": "4",
};
// Villupuram fan faces → platform numbers: R1 → 1, R3 → 2, R7 → 3.
const VILLUPURAM_BOARDS: Record<string, string> = {
  "chennai:2": "1",
  "southern:1": "2",
  "northern:5": "3",
};
// Katpadi row faces → platform numbers: R2 main → 1, R7 → 2.
const KATPADI_BOARDS: Record<string, string> = {
  "western:2": "1",
  "northern:3": "2",
};
// Double-track pair halts → platform numbers (main line 1, branch 2).
const PAIR_BOARDS: Record<string, string> = {
  "southern:4": "1",
  "port:0": "2",
  "southern:5": "1",
  "port:1": "2",
  "southern:6": "1",
  "port:2": "2",
  "western:5": "1",
  "kongu:2": "2",
  "western:6": "1",
  "kongu:1": "2",
};

// Shared name board for a double-track pair halt: one double-sided sign
// midway between the two bare faces (both lines keep their LEDs/numbers).
function SharedNameSign({
  aLine,
  aIndex,
  bLine,
  bIndex,
  name,
}: {
  aLine: string;
  aIndex: number;
  bLine: string;
  bIndex: number;
  name: string;
}) {
  const a = getLine(aLine).stations[aIndex];
  const b = getLine(bLine).stations[bIndex];
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  const gy = groundHeight(mx, mz);
  const tex = stationSignTexture(name);
  if (!tex) return null;
  return (
    <group position={[mx, gy, mz]} rotation-y={a.yaw}>
      {[-3.5, 3.5].map((x) => (
        <mesh key={x} position={[x, 2.1, 0]}>
          <cylinderGeometry args={[0.09, 0.09, 4.2, 8]} />
          <meshStandardMaterial color="#3a3f45" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 3.4, 0.05]}>
        <planeGeometry args={[8, 1.6]} />
        <meshStandardMaterial map={tex} roughness={0.7} />
      </mesh>
      <mesh position={[0, 3.4, -0.05]} rotation-y={Math.PI}>
        <planeGeometry args={[8, 1.6]} />
        <meshStandardMaterial map={tex} roughness={0.7} />
      </mesh>
    </group>
  );
}

// Trichy Grand Junction concourse: one hall + single name boards tying the
// four-row platform faces together. Axis-aligned in the pocket south of
// the row (36 E-W × 16 N-S): clear of every track, platform, buffer wall
// and dwelling consist in the complex.
function TrichyJunction() {
  const t = getLine("chennai").stations[8];
  const mx = t.x + 10;
  const mz = t.z + 32;
  const gy = groundHeight(mx, mz);
  const sign = stationSignTexture("TRICHY JN");
  return (
    <group position={[mx, gy, mz]}>
      {/* Hall */}
      <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[36, 5, 16]} />
        <meshStandardMaterial color="#c9bfa8" roughness={0.9} />
      </mesh>
      {/* Corner pilasters */}
      {[-17.5, 17.5].map((x) =>
        [-7.5, 7.5].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 2.5, z]}>
            <boxGeometry args={[1, 5, 1]} />
            <meshStandardMaterial color="#7a3b2e" roughness={0.9} />
          </mesh>
        )),
      )}
      {/* Roof + fascia trim */}
      <mesh position={[0, 5.2, 0]} castShadow>
        <boxGeometry args={[38, 0.3, 18]} />
        <meshStandardMaterial color="#7a3b2e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 4.95, 0]}>
        <boxGeometry args={[38.4, 0.25, 18.4]} />
        <meshStandardMaterial color="#f3e3c2" roughness={0.7} />
      </mesh>
      {/* Door insets facing Route 1's platform (south side) */}
      {[-9, 0, 9].map((x) => (
        <mesh key={x} position={[x, 1.6, 8.02]}>
          <boxGeometry args={[4, 3.2, 0.1]} />
          <meshStandardMaterial color="#2b2f36" roughness={0.9} />
        </mesh>
      ))}
      {/* Single name boards, both long sides */}
      {sign && (
        <>
          <mesh position={[0, 3.9, 8.08]}>
            <planeGeometry args={[12, 2.4]} />
            <meshStandardMaterial map={sign} roughness={0.7} />
          </mesh>
          <mesh position={[0, 3.9, -8.08]} rotation-y={Math.PI}>
            <planeGeometry args={[12, 2.4]} />
            <meshStandardMaterial map={sign} roughness={0.7} />
          </mesh>
        </>
      )}
    </group>
  );
}

// Villupuram row shed: ONE roof over all three N-S faces (the single
// station). Axis-aligned — tracks run world N-S at x 0/+14/+28, so the
// 49 m roof spans x -8..+41 and 140 m covers z ±70. Funnels dive under
// the roof edges in the open (nearest column 11 m+). Columns stand only
// in verified gaps (all clearances ≥2 m).
function VillupuramShed() {
  const v = getLine("chennai").stations[2];
  const gy = groundHeight(v.x + 16.5, v.z);
  const lampRef = useRef<THREE.InstancedMesh>(null);
  const lamps = useMemo(
    () =>
      [-16.5, -2.5, 11.5].flatMap((x) =>
        [-48, -24, 0, 24, 48].map((z) => ({ x, y: 6.85, z, yaw: 0, len: 1 })),
      ),
    [],
  );
  useFillInstances(lampRef, lamps, 1);
  return (
    <group position={[v.x + 16.5, gy, v.z]}>
      {[-21.5, -7, 7, 21.5].map((x) =>
        [-60, 0, 60].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 3.5, z]}>
            <cylinderGeometry args={[0.22, 0.26, 7, 8]} />
            <meshStandardMaterial color="#3a3f45" roughness={0.8} />
          </mesh>
        )),
      )}
      <mesh position={[0, 7.1, 0]} castShadow>
        <boxGeometry args={[49, 0.3, 140]} />
        <meshStandardMaterial color="#7a3b2e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 6.85, 0]}>
        <boxGeometry args={[49.4, 0.25, 140.4]} />
        <meshStandardMaterial color="#f3e3c2" roughness={0.7} />
      </mesh>
      {/* Tube-light battens over each track (one instanced draw call). */}
      <instancedMesh ref={lampRef} args={[undefined, undefined, lamps.length]} frustumCulled={false}>
        <boxGeometry args={[0.5, 0.12, 1.4]} />
        <meshBasicMaterial color="#fff3d0" toneMapped={false} />
      </instancedMesh>
      {/* Two warm pools of real light over the row (night-readable). */}
      <pointLight position={[-2.5, 5.5, -30]} color="#ffe2b0" intensity={400} distance={55} decay={2} />
      <pointLight position={[-2.5, 5.5, 30]} color="#ffe2b0" intensity={400} distance={55} decay={2} />
    </group>
  );
}

// Villupuram row concourse: one hall + single name boards tying the three
// N-S faces together. Sits in the open pocket west of the row — clear of
// every track, platform, dwell, approach funnel and buffer wall.
// Axis-aligned with yaw π/2 (hall long axis N-S, doors face the platforms).
function VillupuramJunction() {
  const v = getLine("chennai").stations[2];
  const mx = v.x - 40;
  const mz = v.z;
  const gy = groundHeight(mx, mz);
  const sign = stationSignTexture("VILLUPURAM");
  return (
    <group position={[mx, gy, mz]} rotation-y={Math.PI / 2}>
      {/* Hall */}
      <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[36, 5, 16]} />
        <meshStandardMaterial color="#c9bfa8" roughness={0.9} />
      </mesh>
      {/* Corner pilasters */}
      {[-17.5, 17.5].map((x) =>
        [-7.5, 7.5].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 2.5, z]}>
            <boxGeometry args={[1, 5, 1]} />
            <meshStandardMaterial color="#7a3b2e" roughness={0.9} />
          </mesh>
        )),
      )}
      {/* Roof + fascia trim */}
      <mesh position={[0, 5.2, 0]} castShadow>
        <boxGeometry args={[38, 0.3, 18]} />
        <meshStandardMaterial color="#7a3b2e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 4.95, 0]}>
        <boxGeometry args={[38.4, 0.25, 18.4]} />
        <meshStandardMaterial color="#f3e3c2" roughness={0.7} />
      </mesh>
      {/* Door insets facing the platforms (south side) */}
      {[-9, 0, 9].map((x) => (
        <mesh key={x} position={[x, 1.6, 8.02]}>
          <boxGeometry args={[4, 3.2, 0.1]} />
          <meshStandardMaterial color="#2b2f36" roughness={0.9} />
        </mesh>
      ))}
      {/* Single name boards, both long sides */}
      {sign && (
        <>
          <mesh position={[0, 3.9, 8.08]}>
            <planeGeometry args={[12, 2.4]} />
            <meshStandardMaterial map={sign} roughness={0.7} />
          </mesh>
          <mesh position={[0, 3.9, -8.08]} rotation-y={Math.PI}>
            <planeGeometry args={[12, 2.4]} />
            <meshStandardMaterial map={sign} roughness={0.7} />
          </mesh>
        </>
      )}
    </group>
  );
}

// Coimbatore row shed: ONE roof over the R2+R6 termini (R8 keeps its own
// halt on the western spur). Origin on R2's face, yaw exact; tracks at
// local 0 (R2) and -20 (R6). Hanging 1·2 boards, tube battens, single
// COIMBATORE fascia. Columns stand only in verified gaps.
function CoimbatoreShed() {
  const r = getLine("western").stations[7];
  const gy = groundHeight(r.x, r.z);
  const sign = stationSignTexture("COIMBATORE");
  const one = stationSignTexture("1");
  const two = stationSignTexture("2");
  return (
    <group position={[r.x, gy, r.z]} rotation-y={r.yaw}>
      {[-31, -12, 11].map((x) =>
        [-60, 0, 60].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 3.5, z]}>
            <cylinderGeometry args={[0.22, 0.26, 7, 8]} />
            <meshStandardMaterial color="#3a3f45" roughness={0.8} />
          </mesh>
        )),
      )}
      <mesh position={[-10, 7.1, 0]} castShadow>
        <boxGeometry args={[44, 0.3, 140]} />
        <meshStandardMaterial color="#7a3b2e" roughness={0.9} />
      </mesh>
      <mesh position={[-10, 6.85, 0]}>
        <boxGeometry args={[44.4, 0.25, 140.4]} />
        <meshStandardMaterial color="#f3e3c2" roughness={0.7} />
      </mesh>
      {/* Tube battens over both tracks (mounted, always lit). */}
      {[0, -20].map((lx) =>
        [-10, 0, 10].map((dz) => (
          <mesh key={`${lx}:${dz}`} position={[lx, 6.85, dz]}>
            <boxGeometry args={[1.4, 0.12, 0.5]} />
            <meshBasicMaterial color="#fff3d0" toneMapped={false} />
          </mesh>
        )),
      )}
      {/* Single name board on the south fascia, readable both ways. */}
      {sign && (
        <>
          <mesh position={[14.2, 5.8, 0]} rotation-y={Math.PI / 2}>
            <planeGeometry args={[10, 2]} />
            <meshStandardMaterial map={sign} roughness={0.7} />
          </mesh>
          <mesh position={[14.2, 5.8, 0]} rotation-y={-Math.PI / 2}>
            <planeGeometry args={[10, 2]} />
            <meshStandardMaterial map={sign} roughness={0.7} />
          </mesh>
        </>
      )}
      {/* Hanging platform number boards over each track: 1-2. */}
      {[
        { tex: one, lx: 0 },
        { tex: two, lx: -20 },
      ].map(({ tex, lx }, i) => (
        <group key={i} position={[lx, 0, 0]}>
          {[-0.5, 0.5].map((dx) => (
            <mesh key={dx} position={[dx, 5.6, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 1.6, 6]} />
              <meshStandardMaterial color="#2c2f34" roughness={0.8} />
            </mesh>
          ))}
          {tex && (
            <>
              <mesh position={[0, 4.6, 0.02]}>
                <planeGeometry args={[3.2, 0.8]} />
                <meshStandardMaterial map={tex} roughness={0.6} />
              </mesh>
              <mesh position={[0, 4.6, -0.02]} rotation-y={Math.PI}>
                <planeGeometry args={[3.2, 0.8]} />
                <meshStandardMaterial map={tex} roughness={0.6} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  );
}

// Katpadi junction shed: ONE roof over both faces (R2 main, R7 fourteen
// meters north), hanging 1·2 boards, tube battens and a single KATPADI
// fascia. Columns stand only in verified gaps (all clearances ≥2 m,
// including passing trains at every z).
function KatpadiJunction() {
  const r = getLine("western").stations[2];
  const gy = groundHeight(r.x, r.z);
  const sign = stationSignTexture("KATPADI");
  const one = stationSignTexture("1");
  const two = stationSignTexture("2");
  return (
    <group position={[r.x, gy, r.z]} rotation-y={r.yaw}>
      {[-19, -4.5, 11].map((x) =>
        [-50, 0, 50].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 3.5, z]}>
            <cylinderGeometry args={[0.22, 0.26, 7, 8]} />
            <meshStandardMaterial color="#3a3f45" roughness={0.8} />
          </mesh>
        )),
      )}
      <mesh position={[-2.5, 7.1, 0]} castShadow>
        <boxGeometry args={[31, 0.3, 120]} />
        <meshStandardMaterial color="#7a3b2e" roughness={0.9} />
      </mesh>
      <mesh position={[-2.5, 6.85, 0]}>
        <boxGeometry args={[31.4, 0.25, 120.4]} />
        <meshStandardMaterial color="#f3e3c2" roughness={0.7} />
      </mesh>
      {/* Tube battens over both tracks (mounted, always lit). */}
      {[0, -14].map((lx) =>
        [-10, 0, 10].map((dz) => (
          <mesh key={`${lx}:${dz}`} position={[lx, 6.85, dz]}>
            <boxGeometry args={[1.4, 0.12, 0.5]} />
            <meshBasicMaterial color="#fff3d0" toneMapped={false} />
          </mesh>
        )),
      )}
      {/* Single name board on the south fascia, readable both ways. */}
      {sign && (
        <>
          <mesh position={[13.2, 5.8, 0]} rotation-y={Math.PI / 2}>
            <planeGeometry args={[10, 2]} />
            <meshStandardMaterial map={sign} roughness={0.7} />
          </mesh>
          <mesh position={[13.2, 5.8, 0]} rotation-y={-Math.PI / 2}>
            <planeGeometry args={[10, 2]} />
            <meshStandardMaterial map={sign} roughness={0.7} />
          </mesh>
        </>
      )}
      {/* Hanging platform number boards over each track: 1-2. */}
      {[
        { tex: one, lx: 0 },
        { tex: two, lx: -14 },
      ].map(({ tex, lx }, i) => (
        <group key={i} position={[lx, 0, 0]}>
          {[-0.5, 0.5].map((dx) => (
            <mesh key={dx} position={[dx, 5.6, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 1.6, 6]} />
              <meshStandardMaterial color="#2c2f34" roughness={0.8} />
            </mesh>
          ))}
          {tex && (
            <>
              <mesh position={[0, 4.6, 0.02]}>
                <planeGeometry args={[3.2, 0.8]} />
                <meshStandardMaterial map={tex} roughness={0.6} />
              </mesh>
              <mesh position={[0, 4.6, -0.02]} rotation-y={Math.PI}>
                <planeGeometry args={[3.2, 0.8]} />
                <meshStandardMaterial map={tex} roughness={0.6} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  );
}

// Arakkonam junction shed: ONE roof over both faces (R2 main, R7 fourteen
// meters south on the same side as R2's platform), hanging 1·2 boards,
// tube battens and a single ARAKKONAM fascia. Columns stand only in
// verified gaps (all clearances ≥2 m).
function ArakkonamJunction() {  const r = getLine("western").stations[1];
  const gy = groundHeight(r.x, r.z);
  const sign = stationSignTexture("ARAKKONAM");
  const one = stationSignTexture("1");
  const two = stationSignTexture("2");
  return (
    <group position={[r.x, gy, r.z]} rotation-y={r.yaw}>
      {[-5, 9.5, 24].map((x) =>
        [-50, 0, 50].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 3.5, z]}>
            <cylinderGeometry args={[0.22, 0.26, 7, 8]} />
            <meshStandardMaterial color="#3a3f45" roughness={0.8} />
          </mesh>
        )),
      )}
      <mesh position={[9.5, 7.1, 0]} castShadow>
        <boxGeometry args={[29, 0.3, 120]} />
        <meshStandardMaterial color="#7a3b2e" roughness={0.9} />
      </mesh>
      <mesh position={[9.5, 6.85, 0]}>
        <boxGeometry args={[29.4, 0.25, 120.4]} />
        <meshStandardMaterial color="#f3e3c2" roughness={0.7} />
      </mesh>
      {/* Tube battens over both tracks (mounted, always lit). */}
      {[0, 14].map((lx) =>
        [-10, 0, 10].map((dz) => (
          <mesh key={`${lx}:${dz}`} position={[lx, 6.85, dz]}>
            <boxGeometry args={[1.4, 0.12, 0.5]} />
            <meshBasicMaterial color="#fff3d0" toneMapped={false} />
          </mesh>
        )),
      )}
      {/* Single name board on the south fascia, readable both ways. */}
      {sign && (
        <>
          <mesh position={[24.2, 5.8, 0]} rotation-y={Math.PI / 2}>
            <planeGeometry args={[10, 2]} />
            <meshStandardMaterial map={sign} roughness={0.7} />
          </mesh>
          <mesh position={[24.2, 5.8, 0]} rotation-y={-Math.PI / 2}>
            <planeGeometry args={[10, 2]} />
            <meshStandardMaterial map={sign} roughness={0.7} />
          </mesh>
        </>
      )}
      {/* Hanging platform number boards over each track: 1-2. */}
      {[
        { tex: one, lx: 0 },
        { tex: two, lx: 14 },
      ].map(({ tex, lx }, i) => (
        <group key={i} position={[lx, 0, 0]}>
          {[-0.5, 0.5].map((dx) => (
            <mesh key={dx} position={[dx, 5.6, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 1.6, 6]} />
              <meshStandardMaterial color="#2c2f34" roughness={0.8} />
            </mesh>
          ))}
          {tex && (
            <>
              <mesh position={[0, 4.6, 0.02]}>
                <planeGeometry args={[3.2, 0.8]} />
                <meshStandardMaterial map={tex} roughness={0.6} />
              </mesh>
              <mesh position={[0, 4.6, -0.02]} rotation-y={Math.PI}>
                <planeGeometry args={[3.2, 0.8]} />
                <meshStandardMaterial map={tex} roughness={0.6} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  );
}
// Columns stand only in the gaps between tracks/platforms.
function TrichyShed() {
  const t = getLine("chennai").stations[8];
  const gy = groundHeight(t.x, t.z - 8);
  // Tube-light battens over each platform row (one instanced draw call).
  const lampRef = useRef<THREE.InstancedMesh>(null);
  const lamps = useMemo(
    () =>
      // Shed-local laterals of the four platform centers (world z
      // +11.4 / +4.6 / -9.4 / -32.6, origin z -8).
      [19.4, 12.6, -1.4, -24.6].flatMap((z) =>
        [-48, -24, 0, 24, 48].map((x) => ({ x, y: 6.85, z, yaw: 0, len: 1 })),
      ),
    [],
  );
  useFillInstances(lampRef, lamps, 1);
  return (
    <group position={[t.x, gy, t.z - 8]}>
      {/* Columns stand only in the gaps: R4/R1 platforms (+8), R1 track /
      R3 platform (-4.5), R3 track / R6 dwell (-22). All clearances ≥2 m. */}
      {[-66, 66].map((x) =>
        [16, 3.5, -14].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 3.5, z]}>
            <cylinderGeometry args={[0.22, 0.26, 7, 8]} />
            <meshStandardMaterial color="#3a3f45" roughness={0.8} />
          </mesh>
        )),
      )}
      <mesh position={[0, 3.5, 3.5]}>
        <cylinderGeometry args={[0.22, 0.26, 7, 8]} />
        <meshStandardMaterial color="#3a3f45" roughness={0.8} />
      </mesh>
      {/* Roof + fascia trim (clears pantographs at ~6 m). */}
      <mesh position={[0, 7.1, 0]} castShadow>
        <boxGeometry args={[140, 0.3, 60]} />
        <meshStandardMaterial color="#7a3b2e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 6.85, 0]}>
        <boxGeometry args={[140.4, 0.25, 60.4]} />
        <meshStandardMaterial color="#f3e3c2" roughness={0.7} />
      </mesh>
      {/* Tube battens mounted under the roof (one draw call, always lit). */}
      <instancedMesh ref={lampRef} args={[undefined, undefined, lamps.length]} frustumCulled={false}>
        <boxGeometry args={[1.4, 0.12, 0.5]} />
        <meshBasicMaterial color="#fff3d0" toneMapped={false} />
      </instancedMesh>
      {/* Two warm pools of real light over the platforms (night-readable). */}
      <pointLight position={[-30, 5.5, 1]} color="#ffe2b0" intensity={400} distance={55} decay={2} />
      <pointLight position={[30, 5.5, 1]} color="#ffe2b0" intensity={400} distance={55} decay={2} />
    </group>
  );
}

function ChennaiTerminus({ worldRef }: { worldRef?: RefObject<GameWorld> }) {
  const e = getLine("chennai").stations[0];
  const w = getLine("western").stations[0];
  const n = getLine("northern").stations[0];
  // Shed frame sits on the middle track (Route 2): all three dwells are
  // abreast at laterals -11 / 0 / +11, platforms level at 0.95 throughout.
  const mx = w.x;
  const mz = w.z;
  const gy = groundHeight(mx, mz);
  const yaw = w.yaw;
  const sign = stationSignTexture("CHENNAI");
  const one = stationSignTexture("1");
  const two = stationSignTexture("2");
  const three = stationSignTexture("3");
  // Track spots in shed-local coords (for lamps + number boards).
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const local = (x: number, z: number) => ({
    lx: cy * (x - mx) - sy * (z - mz),
    lz: sy * (x - mx) + cy * (z - mz),
  });
  const eL = local(e.x, e.z);
  const wL = local(w.x, w.z);
  const nL = local(n.x, n.z);
  return (
    <group>
      {/* Bare platforms come from the main loop (OPEN_PLATFORM_FACES);
      this is the shared shed only. */}
      <group position={[mx, gy, mz]} rotation-y={yaw}>
        {/* Columns stand only in the gaps: west of R1 (-15) and east of
        the R7 platform (+21). All clearances ≥2 m. */}
        {[-15, 21].map((x) =>
          [-60, 0, 60].map((z) => (
            <mesh key={`${x}:${z}`} position={[x, 3.5, z]}>
              <cylinderGeometry args={[0.22, 0.26, 7, 8]} />
              <meshStandardMaterial color="#3a3f45" roughness={0.8} />
            </mesh>
          )),
        )}
      {/* Combined trainshed roof over all three tracks + platforms
      (clears the loco pantographs at ~6 m). One level throughout. */}
      <mesh position={[3, 7.1, 0]} castShadow>
        <boxGeometry args={[44, 0.3, 150]} />
        <meshStandardMaterial color="#7a3b2e" roughness={0.9} />
      </mesh>
      <mesh position={[3, 6.85, 0]}>
        <boxGeometry args={[44.4, 0.25, 150.4]} />
        <meshStandardMaterial color="#f3e3c2" roughness={0.7} />
      </mesh>
      {/* Tube battens over all three tracks (mounted, always lit). */}
      {[eL, wL, nL].map((tr, ti) =>
        [-10, 0, 10].map((dz) => (
          <mesh key={`${ti}:${dz}`} position={[tr.lx, 6.85, tr.lz + dz]}>
            <boxGeometry args={[1.4, 0.12, 0.5]} />
            <meshBasicMaterial color="#fff3d0" toneMapped={false} />
          </mesh>
        )),
      )}
      {/* Two warm pools of real light between the tracks (night-readable). */}
      <pointLight position={[-5.5, 5.5, 0]} color="#ffe2b0" intensity={400} distance={55} decay={2} />
      <pointLight position={[5.5, 5.5, 0]} color="#ffe2b0" intensity={400} distance={55} decay={2} />
        {/* Grand name board on the east fascia, readable both ways */}
        {sign && (
          <>
            <mesh position={[25.4, 5.8, 0]} rotation-y={Math.PI / 2}>
              <planeGeometry args={[12, 2.4]} />
              <meshStandardMaterial map={sign} roughness={0.7} />
            </mesh>
            <mesh position={[25.4, 5.8, 0]} rotation-y={-Math.PI / 2}>
              <planeGeometry args={[12, 2.4]} />
              <meshStandardMaterial map={sign} roughness={0.7} />
            </mesh>
          </>
        )}
        {/* Hanging platform number boards over each track: 1-2-3 */}
        {[
          { tex: one, at: eL },
          { tex: two, at: wL },
          { tex: three, at: nL },
        ].map(({ tex, at }, i) => (
          <group key={i} position={[at.lx, 0, at.lz]}>
            {[-0.5, 0.5].map((dx) => (
              <mesh key={dx} position={[dx, 5.6, 0]}>
                <cylinderGeometry args={[0.03, 0.03, 1.6, 6]} />
                <meshStandardMaterial color="#2c2f34" roughness={0.8} />
              </mesh>
            ))}
            {tex && (
              <>
                <mesh position={[0, 4.6, 0.02]}>
                  <planeGeometry args={[3.2, 0.8]} />
                  <meshStandardMaterial map={tex} roughness={0.6} />
                </mesh>
                <mesh position={[0, 4.6, -0.02]} rotation-y={Math.PI}>
                  <planeGeometry args={[3.2, 0.8]} />
                  <meshStandardMaterial map={tex} roughness={0.6} />
                </mesh>
              </>
            )}
          </group>
        ))}
      </group>
    </group>
  );
}

// Buffer stop: red/white striped wall across the rails at every dead end
// so each terminus visibly ends instead of trailing stray track.
function BufferStop({ wall }: { wall: { x: number; z: number; yaw: number } }) {
  const gy = railSurfaceY(wall.x, wall.z);
  return (
    <group position={[wall.x, gy, wall.z]} rotation-y={wall.yaw}>
      {/* Base frame */}
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <boxGeometry args={[2.8, 0.2, 1.4]} />
        <meshStandardMaterial color="#3a3f45" roughness={0.9} />
      </mesh>
      {/* Legs */}
      {[-1.0, 1.0].map((x) => (
        <mesh key={x} position={[x, 0.65, 0]} castShadow>
          <boxGeometry args={[0.28, 1.1, 0.5]} />
          <meshStandardMaterial color="#2b2e34" roughness={0.8} />
        </mesh>
      ))}
      {/* Striped beam across both rails */}
      {[-1.04, -0.52, 0, 0.52, 1.04].map((x, i) => (
        <mesh key={x} position={[x, 1.25, 0]} castShadow>
          <boxGeometry args={[0.5, 0.5, 0.24]} />
          <meshStandardMaterial color={i % 2 === 0 ? "#c0392b" : "#f5f5f5"} roughness={0.6} />
        </mesh>
      ))}
      {/* Warning lamp */}
      <mesh position={[0, 1.65, 0]}>
        <boxGeometry args={[0.3, 0.25, 0.2]} />
        <meshStandardMaterial color="#7a1010" emissive="#c02020" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

export default function Railway({ worldRef }: { worldRef?: RefObject<GameWorld> }) {
  const { pieces, sleepers, piers } = useTrackPieces();
  const ballastRef = useRef<THREE.InstancedMesh>(null);
  const railRef = useRef<THREE.InstancedMesh>(null);
  const sleeperRef = useRef<THREE.InstancedMesh>(null);
  const pierRef = useRef<THREE.InstancedMesh>(null);
  const railMetal = useRailMetalTextures();

  const railItems = useMemo(() => {
    const out: { x: number; y: number; z: number; yaw: number; len: number; dx: number; dz: number }[] = [];
    for (const p of pieces) {
      const rx = Math.cos(p.yaw);
      const rz = -Math.sin(p.yaw);
      for (const side of [-RAIL_GAUGE, RAIL_GAUGE]) {
        out.push({ x: p.x, y: p.y + 0.28, z: p.z, yaw: p.yaw, len: p.len, dx: rx * side, dz: rz * side });
      }
    }
    return out;
  }, [pieces]);

  useFillInstances(ballastRef, pieces.map((p) => ({ ...p, y: p.y + 0.05 })), 1);
  useFillInstances(railRef, railItems, 1);
  useFillInstances(sleeperRef, sleepers, 1);
  useFillInstances(pierRef, piers, 1);

  return (
    <group>
      {/* Ballast beds (unit box scaled per piece) */}
      <instancedMesh ref={ballastRef} args={[undefined, undefined, pieces.length]} frustumCulled={false}>
        <boxGeometry args={[BALLAST_W, 0.18, 1]} />
        <meshStandardMaterial color="#6b6259" roughness={1} />
      </instancedMesh>
      {/* Twin steel rails (PBR metal touch: map + metallic/roughness/normal) */}
      <instancedMesh ref={railRef} args={[undefined, undefined, railItems.length]} frustumCulled={false}>
        <boxGeometry args={[0.09, 0.14, 1]} />
        <meshStandardMaterial
          map={railMetal?.map}
          metalnessMap={railMetal?.metalnessMap}
          roughnessMap={railMetal?.roughnessMap}
          normalMap={railMetal?.normalMap}
          color="#ffffff"
          metalness={1}
          roughness={1}
        />
      </instancedMesh>
      {/* Sleepers */}
      <instancedMesh ref={sleeperRef} args={[undefined, undefined, sleepers.length]} frustumCulled={false}>
        <boxGeometry args={[2.3, 0.1, 0.55]} />
        <meshStandardMaterial color="#5a4632" roughness={1} />
      </instancedMesh>
      {/* Trestle piers carrying the deck over water */}
      <instancedMesh ref={pierRef} args={[undefined, undefined, piers.length]} frustumCulled={false}>
        <boxGeometry args={[1.6, 1, 1.6]} />
        <meshStandardMaterial color="#8a8f98" roughness={0.9} />
      </instancedMesh>
      {getLines().map((line) =>
        line.stations.map((_, i) => {
          const key = `${line.def.id}:${i}`;
          // Grand-station faces render bare (sheds speak for them); the two
          // Chennai terminus faces are drawn by ChennaiTerminus itself.
          if (CHENNAI_TERMINUS_KEYS.has(key)) return null;
          if (!OPEN_PLATFORM_FACES.has(key)) {
            return <Station key={key} lineId={line.def.id} index={i} worldRef={worldRef} />;
          }
          const board =
            TRICHY_BOARDS[key] ?? VILLUPURAM_BOARDS[key] ?? PAIR_BOARDS[key] ?? KATPADI_BOARDS[key];
          return (
            <Station
              key={key}
              lineId={line.def.id}
              index={i}
              bare
              numberBoard={board}
              worldRef={worldRef}
            />
          );
        }),
      )}
      {/* One grand terminus instead of two overlapping Chennai buildings */}
      <ChennaiTerminus worldRef={worldRef} />
      {/* One shed over both Arakkonam faces instead of two buildings */}
      <ArakkonamJunction />
      {/* One shed over both Katpadi faces instead of two buildings */}
      <KatpadiJunction />
      {/* One concourse over the Villupuram fan instead of three buildings */}
      <VillupuramJunction />
      {/* One roof over the Villupuram N-S row: the single station */}
      <VillupuramShed />
      {/* One roof over the Villupuram N-S row: the single station */}
      <VillupuramShed />
      {/* One shed over the Coimbatore row pair instead of two buildings */}
      <CoimbatoreShed />
      {/* Shared name boards for the double-track pair halts */}
      <SharedNameSign aLine="southern" aIndex={4} bLine="port" bIndex={0} name="MADURAI" />
      <SharedNameSign aLine="southern" aIndex={5} bLine="port" bIndex={1} name="VIRUDHUNAGAR" />
      <SharedNameSign aLine="southern" aIndex={6} bLine="port" bIndex={2} name="TIRUNELVELI" />
      <SharedNameSign aLine="western" aIndex={5} bLine="kongu" bIndex={2} name="ERODE" />
      <SharedNameSign aLine="western" aIndex={6} bLine="kongu" bIndex={1} name="TIRUPPUR" />
      {/* One concourse complex instead of four scattered Trichy buildings */}
      <TrichyJunction />
      {/* One roof over all four Trichy faces: the single station */}
      <TrichyShed />
      {getLines().map((line) =>
        lineEndWalls(line.def.id).map((w, i) => (
          <BufferStop key={`${line.def.id}:end:${i}`} wall={w} />
        )),
      )}
    </group>
  );
}
