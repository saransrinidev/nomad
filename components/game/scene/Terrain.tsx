// Plain Tamil Nadu land mesh: 16x16 km heightfield split into 4x4 render
// chunks (one mesh each, frustum-culled) over a single global data grid.
// Rebuilt from the store whenever the version bumps. Vertex colors carry
// the paint layers as a tint over the repeating grass texture from
// public/texture.

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
  worldToGrid,
} from "@/lib/game/map/terrain";

const SKIRT_Y = -8.6;
const CHUNK_COUNT = CHUNKS_PER_SIDE * CHUNKS_PER_SIDE;
// Texture tile size in meters. Each chunk spans UV 0..1, so the repeat is
// derived from the chunk size (4000 m / 8 m = 500 tiles per chunk).
const GRASS_TILE_METERS = 8;
const GRASS_REPEAT = CHUNK_SIZE / GRASS_TILE_METERS;

function buildColors(): THREE.BufferAttribute {
  const colors = new Float32Array(CHUNK_RES * CHUNK_RES * 3);
  const attr = new THREE.BufferAttribute(colors, 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  return attr;
}

/** Chunk (cx, cz) mesh origin = chunk center in game meters. */
function chunkCenter(cx: number, cz: number): [number, number] {
  const o = chunkOrigin(cx, cz);
  return [o.x + CHUNK_SIZE / 2, o.z + CHUNK_SIZE / 2];
}

/** Real grass albedo + normal from public/texture (shared by all chunks). */
function useGrassTextures() {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    const loader = new THREE.TextureLoader();
    const map = loader.load("/texture/ph_grass_path_2/ph_grass_path_2_baseColor.webp");
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(GRASS_REPEAT, GRASS_REPEAT);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    const normalMap = loader.load("/texture/ph_grass_path_2/ph_grass_path_2_normal.webp");
    normalMap.wrapS = THREE.RepeatWrapping;
    normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.repeat.set(GRASS_REPEAT, GRASS_REPEAT);
    normalMap.anisotropy = 8;
    return { map, normalMap };
  }, []);
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

  const grass = useGrassTextures();

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
        col.setXYZ(j, tmp.r, tmp.g, tmp.b);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      g.computeVertexNormals();
      g.computeBoundingSphere();
    }
  });

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
              <meshStandardMaterial
                map={grass?.map}
                normalMap={grass?.normalMap}
                vertexColors
                roughness={1}
                metalness={0}
              />
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
