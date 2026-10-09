// Static railway infrastructure for every line: instanced ballast + twin
// rails + sleepers along each curve, plus a platform, shelter, sign board,
// benches and lamps at each station. Purely presentational; moving consists
// live in Train.tsx. Heights follow groundHeight so track sits on terrain.

"use client";

import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { getLine, getLines, trackPointAt } from "@/lib/game/map/railway";
import { consistLength } from "@/lib/game/map/railway";
import { groundHeight } from "@/lib/game/map/terrain";

const BALLAST_W = 4.5;
const RAIL_GAUGE = 0.85; // half-gauge: rails at ±0.85 m
const PIECE_LEN = 60; // ballast/rail segment length

const signCache = new Map<string, THREE.CanvasTexture | null>();
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
    for (const line of getLines()) {
      const n = Math.max(1, Math.round(line.length / PIECE_LEN));
      for (let i = 0; i < n; i++) {
        const s0 = (i / n) * line.length;
        const s1 = ((i + 1) / n) * line.length;
        const p0 = trackPointAt(line.def.id, s0);
        const p1 = trackPointAt(line.def.id, s1);
        const mx = (p0.x + p1.x) / 2;
        const mz = (p0.z + p1.z) / 2;
        pieces.push({
          x: mx,
          y: groundHeight(mx, mz),
          z: mz,
          yaw: Math.atan2(p1.x - p0.x, p1.z - p0.z),
          len: Math.hypot(p1.x - p0.x, p1.z - p0.z) + 0.6,
        });
      }
      const count = Math.floor(line.length / 3);
      for (let i = 0; i < count; i++) {
        const p = trackPointAt(line.def.id, i * 3 + 1.5);
        sleepers.push({ x: p.x, y: groundHeight(p.x, p.z) + 0.14, z: p.z, yaw: p.yaw });
      }
    }
    return { pieces, sleepers };
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

function Station({ lineId, index }: { lineId: string; index: number }) {
  const line = getLine(lineId);
  const st = line.stations[index];
  const sign = useMemo(() => stationSignTexture(st.short), [st.short]);
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
      {/* Platform */}
      <mesh position={[0, 0.55, 0]} receiveShadow>
        <boxGeometry args={[5, 1.1, platLen]} />
        <meshStandardMaterial color="#b0a58e" roughness={1} />
      </mesh>
      <mesh position={[-2.4, 1.12, 0]}>
        <boxGeometry args={[0.3, 0.04, platLen]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.8} />
      </mesh>
      {/* Access stairs at both ends (visual; jump also works) */}
      {[platLen / 2 + 0.4, -platLen / 2 - 0.4].map((z, si) => (
        <group key={si} position={[0, 0, z]}>
          <mesh position={[0, 0.185, 0]} receiveShadow>
            <boxGeometry args={[3, 0.37, 0.9]} />
            <meshStandardMaterial color="#9a917f" roughness={1} />
          </mesh>
          <mesh position={[0, 0.55, si === 0 ? -0.55 : 0.55]} receiveShadow>
            <boxGeometry args={[3, 0.37, 0.9]} />
            <meshStandardMaterial color="#9a917f" roughness={1} />
          </mesh>
        </group>
      ))}
      {/* Shelter: posts + roof */}
      {[-6, 6].map((z) =>
        [-1.5, 1.5].map((x) => (
          <mesh key={`${x}-${z}`} position={[x, 2.2, z]} castShadow>
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
        <mesh key={z} position={[0.8, 1.45, z]} castShadow>
          <boxGeometry args={[0.6, 0.5, 2.2]} />
          <meshStandardMaterial color="#6b4a2f" roughness={0.9} />
        </mesh>
      ))}
      {/* Name board facing the track */}
      <group position={[-2.6, 0, 0]} rotation-y={-Math.PI / 2}>
        {[-2.4, 2.4].map((x) => (
          <mesh key={x} position={[x, 2.4, 0]} castShadow>
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
      {/* Lamp posts */}
      {[-14, 14].map((z) => (
        <group key={z} position={[1.8, 0, z]}>
          <mesh position={[0, 3, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.1, 6, 8]} />
            <meshStandardMaterial color="#2c2f34" roughness={0.8} />
          </mesh>
          <mesh position={[0, 6.1, 0]}>
            <boxGeometry args={[0.5, 0.3, 0.5]} />
            <meshStandardMaterial
              color="#fff2c8"
              emissive="#ffe9a8"
              emissiveIntensity={0.9}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function Railway() {
  const { pieces, sleepers } = useTrackPieces();
  const ballastRef = useRef<THREE.InstancedMesh>(null);
  const railRef = useRef<THREE.InstancedMesh>(null);
  const sleeperRef = useRef<THREE.InstancedMesh>(null);

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

  return (
    <group>
      {/* Ballast beds (unit box scaled per piece) */}
      <instancedMesh ref={ballastRef} args={[undefined, undefined, pieces.length]} frustumCulled={false}>
        <boxGeometry args={[BALLAST_W, 0.18, 1]} />
        <meshStandardMaterial color="#6b6259" roughness={1} />
      </instancedMesh>
      {/* Twin steel rails */}
      <instancedMesh ref={railRef} args={[undefined, undefined, railItems.length]} frustumCulled={false}>
        <boxGeometry args={[0.09, 0.14, 1]} />
        <meshStandardMaterial color="#9aa0a8" roughness={0.35} metalness={0.8} />
      </instancedMesh>
      {/* Sleepers */}
      <instancedMesh ref={sleeperRef} args={[undefined, undefined, sleepers.length]} frustumCulled={false}>
        <boxGeometry args={[2.3, 0.1, 0.55]} />
        <meshStandardMaterial color="#5a4632" roughness={1} />
      </instancedMesh>
      {getLines().map((line) =>
        line.stations.map((_, i) => <Station key={`${line.def.id}:${i}`} lineId={line.def.id} index={i} />),
      )}
    </group>
  );
}
