// Designed terrain mesh: static 8x8 km heightfield rebuilt from the store
// whenever the version bumps (sculpt/paint strokes). Vertex colors carry the
// paint layers under the repeating grass detail texture. Plus a far skirt.

"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  getTerrain,
  getTerrainVersion,
  PAINT_COLORS,
  registerTerrainMesh,
  TERRAIN_RES,
  WORLD_SIZE,
} from "@/lib/game/map/terrain";

const SKIRT_Y = -8.6;

function buildColors(): THREE.BufferAttribute {
  const colors = new Float32Array(TERRAIN_RES * TERRAIN_RES * 3);
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

export default function Terrain() {
  const meshRef = useRef<THREE.Mesh>(null!);
  const lastVersion = useRef(-1);

  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_RES - 1, TERRAIN_RES - 1);
    g.rotateX(-Math.PI / 2);
    g.setAttribute("color", buildColors());
    return g;
  }, []);

  // Frame-loop writes go through this ref (React Compiler friendly).
  const geoRef = useRef<THREE.BufferGeometry>(null!);
  if (geoRef.current === null) geoRef.current = geo;

  const grass = useMemo(() => makeGrassDetailTexture(), []);

  useEffect(() => {
    registerTerrainMesh(meshRef.current);
    return () => registerTerrainMesh(null);
  }, []);

  useFrame(() => {
    const v = getTerrainVersion();
    if (v === lastVersion.current) return;
    lastVersion.current = v;
    const g = geoRef.current;
    if (!g) return;
    const t = getTerrain();
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = g.attributes.color as THREE.BufferAttribute;
    const tmp = new THREE.Color();
    for (let iz = 0; iz < TERRAIN_RES; iz++) {
      for (let ix = 0; ix < TERRAIN_RES; ix++) {
        const vi = iz * TERRAIN_RES + ix;
        pos.setY(vi, t.heights[vi]);
        tmp.set(PAINT_COLORS[t.paint[vi]] ?? PAINT_COLORS[0]);
        // Subtle checker variation so flat paint isn't banded.
        const shade = (ix + iz) % 2 === 0 ? 1 : 0.96;
        col.setXYZ(vi, tmp.r * shade, tmp.g * shade, tmp.b * shade);
      }
    }
    (geoRef.current.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geoRef.current.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    geoRef.current.computeVertexNormals();
  });

  return (
    <group>
      <mesh ref={meshRef} geometry={geo} receiveShadow frustumCulled={false}>
        {grass ? (
          <meshStandardMaterial map={grass} vertexColors roughness={1} metalness={0} />
        ) : (
          <meshStandardMaterial vertexColors roughness={1} metalness={0} />
        )}
      </mesh>
      {/* Far skirt: endless-looking grass to the horizon past the border. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, SKIRT_Y, 0]}>
        <planeGeometry args={[24000, 24000]} />
        <meshStandardMaterial color="#6f9e52" roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}
