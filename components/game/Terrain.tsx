// Plain Tamil Nadu land mesh: 16x16 km heightfield split into 4x4 render
// chunks (one mesh each, frustum-culled) over a single global data grid.
// Rebuilt from the store whenever the version bumps. Vertex colors carry
// the paint layers (grass land, sand sea/beach) under the repeating detail
// texture.

"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  CHUNK_CELLS,
  CHUNK_RES,
  CHUNK_SIZE,
  chunkOrigin,
  CHUNKS_PER_SIDE,
  getTerrain,
  getTerrainVersion,
  PAINT_COLORS,
  registerTerrainMesh,
  TERRAIN_RES,
  WORLD_SIZE,
  worldToGrid,
} from "@/lib/game/map/terrain";

const SKIRT_Y = -8.6;
const CHUNK_COUNT = CHUNKS_PER_SIDE * CHUNKS_PER_SIDE;

function buildColors(): THREE.BufferAttribute {
  const colors = new Float32Array(CHUNK_RES * CHUNK_RES * 3);
  const attr = new THREE.BufferAttribute(colors, 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  return attr;
}

function makeGrassDetailTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  let s = 99;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#e8e8e8";
  ctx.fillRect(0, 0, size / 2, size / 2);
  ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = rand() > 0.5 ? "#f2f2f2" : "#dedede";
    ctx.fillRect(rand() * size, rand() * size, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(WORLD_SIZE / 8, WORLD_SIZE / 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Chunk (cx, cz) mesh origin = chunk center in game meters. */
function chunkCenter(cx: number, cz: number): [number, number] {
  const o = chunkOrigin(cx, cz);
  return [o.x + CHUNK_SIZE / 2, o.z + CHUNK_SIZE / 2];
}

export default function Terrain() {
  const groupRef = useRef<THREE.Group>(null!);
  const lastVersion = useRef(-1);

  const chunkGeos = useMemo(() => {
    const list: THREE.BufferGeometry[] = [];
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const g = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_CELLS, CHUNK_CELLS);
      g.rotateX(-Math.PI / 2);
      g.setAttribute("color", buildColors());
      list.push(g);
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Frame-loop writes go through this ref (React Compiler friendly).
  const geosRef = useRef<THREE.BufferGeometry[] | null>(null);
  if (geosRef.current === null) geosRef.current = chunkGeos;

  const grass = useMemo(() => makeGrassDetailTexture(), []);

  useEffect(() => {
    registerTerrainMesh(groupRef.current);
    return () => registerTerrainMesh(null);
  }, []);

  useFrame(() => {
    const v = getTerrainVersion();
    if (v === lastVersion.current) return;
    lastVersion.current = v;
    const geos = geosRef.current;
    if (!geos) return;
    const t = getTerrain();
    const tmp = new THREE.Color();
    for (let c = 0; c < CHUNK_COUNT; c++) {
      const cx = c % CHUNKS_PER_SIDE;
      const cz = Math.floor(c / CHUNKS_PER_SIDE);
      const [ccx, ccz] = chunkCenter(cx, cz);
      const g = geos[c];
      const pos = g.attributes.position as THREE.BufferAttribute;
      const col = g.attributes.color as THREE.BufferAttribute;
      for (let j = 0; j < pos.count; j++) {
        // Local plane coords → world meters, then sample the global grid.
        const wx = ccx + pos.getX(j);
        const wz = ccz + pos.getZ(j);
        const [gx, gz] = worldToGrid(wx, wz);
        const gi = gz * TERRAIN_RES + gx;
        pos.setY(j, t.heights[gi]);
        tmp.set(PAINT_COLORS[t.paint[gi]] ?? PAINT_COLORS[0]);
        // Local plane x index for the anti-banding checker. Attribute order
        // still runs +x fastest after rotateX, so j % CHUNK_RES is the
        // column and Math.floor(j / CHUNK_RES) the row.
        const shade =
          ((j % CHUNK_RES) + Math.floor(j / CHUNK_RES)) % 2 === 0 ? 1 : 0.96;
        col.setXYZ(j, tmp.r * shade, tmp.g * shade, tmp.b * shade);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      g.computeVertexNormals();
      g.computeBoundingSphere();
    }
  });

  const matProps = grass
    ? { map: grass, vertexColors: true as const, roughness: 1, metalness: 0 }
    : { vertexColors: true as const, roughness: 1, metalness: 0 };

  return (
    <group>
      <group ref={groupRef}>
        {chunkGeos.map((g, c) => {
          const cx = c % CHUNKS_PER_SIDE;
          const cz = Math.floor(c / CHUNKS_PER_SIDE);
          const [ccx, ccz] = chunkCenter(cx, cz);
          return (
            <mesh
              key={c}
              geometry={g}
              position={[ccx, 0, ccz]}
              receiveShadow
              frustumCulled
            >
              <meshStandardMaterial {...matProps} />
            </mesh>
          );
        })}
      </group>
      {/* Far skirt: seabed-colored base under the ocean plane. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, SKIRT_Y, 0]}>
        <planeGeometry args={[48000, 48000]} />
        <meshStandardMaterial color="#2e5f7a" roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}
