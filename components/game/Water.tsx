// Water bodies: pond + village pond + lake discs with sandy rims, a winding
// river ribbon (pond → lake) with a sand underlay, the legacy west ocean,
// and the infinite follow-ocean. All surfaces use cheap static materials —
// no animation, no per-frame work except the ocean snap (position-only,
// only when the player crosses a tile boundary).

"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  LAKE,
  OCEAN,
  POND,
  RIVER_POINTS,
  RIVER_WIDTH,
  SHORE_X,
  VILLAGE_POND,
  type WaterDisc,
} from "@/lib/game/map/water";
import { WORLD_HALF } from "@/lib/game/map/terrain";
import { getFocusPoint, type GameWorld } from "@/lib/game/state";

const SAND = "#d9c48f";
const WATER_Y = 0.022;

/** Triangle-strip ribbon along XZ points (for river water + sand bed). */
function buildRibbon(
  points: [number, number][],
  width: number,
  y: number,
  vRepeat: number,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  );
  const segs = 80;
  const pos = new Float32Array((segs + 1) * 2 * 3);
  const uv = new Float32Array((segs + 1) * 2 * 2);
  const index: number[] = [];
  const pt = new THREE.Vector3();
  const tan = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const k = i / segs;
    curve.getPoint(k, pt);
    curve.getTangent(k, tan);
    const inv = 1 / Math.max(0.001, Math.hypot(tan.x, tan.z));
    const nx = -tan.z * inv;
    const nz = tan.x * inv;
    const hw = width / 2;
    const o = i * 6;
    pos[o] = pt.x + nx * hw;
    pos[o + 1] = y;
    pos[o + 2] = pt.z + nz * hw;
    pos[o + 3] = pt.x - nx * hw;
    pos[o + 4] = y;
    pos[o + 5] = pt.z - nz * hw;
    const u = i * 4;
    uv[u] = k * vRepeat;
    uv[u + 1] = 0;
    uv[u + 2] = k * vRepeat;
    uv[u + 3] = 1;
    if (i < segs) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function makeWaterTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  let s = 5150;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2f9bd8";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = rand() > 0.5 ? "#54b4e6" : "#2688c4";
    ctx.beginPath();
    ctx.ellipse(
      rand() * size,
      rand() * size,
      6 + rand() * 16,
      4 + rand() * 10,
      rand() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = 0; i < 40; i++) {
    ctx.fillRect(rand() * size, rand() * size, 2, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cloneTexture(tex: THREE.CanvasTexture, rx: number, ry: number) {
  const c = tex.clone();
  c.needsUpdate = true;
  c.repeat.set(rx, ry);
  return c;
}

function Disc({ disc, tex }: { disc: WaterDisc; tex: THREE.CanvasTexture }) {
  return (
    <group position={[disc.x, 0, disc.z]}>
      {/* Sandy rim */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.014, 0]} receiveShadow>
        <ringGeometry args={[disc.r - 0.5, disc.r + 4, 40]} />
        <meshStandardMaterial color={SAND} roughness={1} />
      </mesh>
      {/* Water */}
      <mesh rotation-x={-Math.PI / 2} position={[0, WATER_Y, 0]}>
        <circleGeometry args={[disc.r, 40]} />
        <meshStandardMaterial
          map={tex}
          transparent
          opacity={0.9}
          roughness={0.15}
          metalness={0.05}
        />
      </mesh>
    </group>
  );
}

export default function Water({ worldRef }: { worldRef: RefObject<GameWorld> }) {
  const followRef = useRef<THREE.Mesh>(null!);
  const lastTile = useRef<[number, number] | null>(null);

  const baseTex = useMemo(() => makeWaterTexture(), []);
  const textures = useMemo(() => {
    if (!baseTex) return null;
    return {
      pond: cloneTexture(baseTex, 3, 3),
      lake: cloneTexture(baseTex, 6, 6),
      river: cloneTexture(baseTex, 2, 24),
      ocean: cloneTexture(baseTex, 30, 15),
    };
  }, [baseTex]);

  const riverGeo = useMemo(() => buildRibbon(RIVER_POINTS, RIVER_WIDTH, WATER_Y + 0.004, 24), []);
  const riverBedGeo = useMemo(
    () => buildRibbon(RIVER_POINTS, RIVER_WIDTH + 4, 0.012, 1),
    [],
  );

  useFrame(() => {
    if (worldRef.current.paused) return;
    // Infinite ocean follows the player, snapped to 100 m tiles. Position
    // writes happen only when crossing a tile boundary — otherwise idle.
    const f = getFocusPoint(worldRef.current);
    const tx = Math.round(f.x / 100) * 100;
    const tz = Math.round(f.z / 100) * 100;
    const last = lastTile.current;
    if (!last || last[0] !== tx || last[1] !== tz) {
      lastTile.current = [tx, tz];
      followRef.current.position.set(tx, -0.6, tz);
    }
  });

  if (!textures) return null;
  const oceanW = OCEAN.maxX - OCEAN.minX;
  const oceanD = OCEAN.maxZ - OCEAN.minZ;
  const oceanCX = (OCEAN.minX + OCEAN.maxX) / 2;

  return (
    <group>
      <Disc disc={POND} tex={textures.pond} />
      <Disc disc={VILLAGE_POND} tex={textures.pond} />
      <Disc disc={LAKE} tex={textures.lake} />

      {/* River sand bed + water */}
      <mesh geometry={riverBedGeo}>
        <meshStandardMaterial color={SAND} roughness={1} />
      </mesh>
      <mesh geometry={riverGeo}>
        <meshStandardMaterial
          map={textures.river}
          transparent
          opacity={0.9}
          roughness={0.15}
          metalness={0.05}
        />
      </mesh>

      {/* Legacy west ocean + beach (kept where it still overlaps the island) */}
      <mesh rotation-x={-Math.PI / 2} position={[SHORE_X + 15, 0.015, 0]}>
        <planeGeometry args={[30, oceanD]} />
        <meshStandardMaterial color={SAND} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[oceanCX, 0.02, 0]}>
        <planeGeometry args={[oceanW, oceanD]} />
        <meshStandardMaterial
          map={textures.ocean}
          transparent
          opacity={0.92}
          roughness={0.15}
          metalness={0.05}
        />
      </mesh>

      {/* Infinite ocean around the island (follows the player) */}
      <mesh ref={followRef} rotation-x={-Math.PI / 2} position={[0, -0.6, 0]}>
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial color="#2a8fc4" roughness={0.2} metalness={0.05} />
      </mesh>

      {/* Sandy lip ringing the island shoreline */}
      {[
        { p: [0, 0.02, -WORLD_HALF] as const, a: [WORLD_HALF * 2 + 24, 12] as const },
        { p: [0, 0.02, WORLD_HALF] as const, a: [WORLD_HALF * 2 + 24, 12] as const },
        { p: [-WORLD_HALF, 0.02, 0] as const, a: [12, WORLD_HALF * 2 + 24] as const },
        { p: [WORLD_HALF, 0.02, 0] as const, a: [12, WORLD_HALF * 2 + 24] as const },
      ].map((s, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[s.p[0], s.p[1], s.p[2]]}>
          <planeGeometry args={[s.a[0], s.a[1]]} />
          <meshStandardMaterial color={SAND} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
