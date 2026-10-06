// Maple Village: authored low-poly settlement 7 km east of spawn.
// Houses (box + pyramid roof + door + glowing windows), central well plaza,
// fences, hand-placed trees, and a wooden entrance sign. Fully static.

"use client";

import { useMemo } from "react";
import * as THREE from "three";
import {
  VILLAGE_CENTER,
  VILLAGE_HOUSES,
  VILLAGE_NAME,
  VILLAGE_TREES,
  type VillageHouse,
} from "@/lib/game/map/village";

const DOOR = "#4a3226";
const GLASS = "#bfe6f5";
const WOOD = "#6b4a2f";

function makeVillageSignTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#4a3520";
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = "#e8d9a0";
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = "#f5ecd0";
  ctx.font = "bold 56px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(VILLAGE_NAME, 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function House({ house }: { house: VillageHouse }) {
  const [cx, , cz] = VILLAGE_CENTER;
  const x = cx + house.dx;
  const z = cz + house.dz;
  const roofR = Math.hypot(house.w, house.d) / 2 + 0.6;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, house.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[house.w, house.h, house.d]} />
        <meshStandardMaterial color={house.wall} roughness={0.95} />
      </mesh>
      <mesh position={[0, house.h + 1.1, 0]} rotation-y={Math.PI / 4} castShadow>
        <coneGeometry args={[roofR, 2.4, 4]} />
        <meshStandardMaterial color={house.roof} roughness={0.9} flatShading />
      </mesh>
      {/* Door + windows on the +Z face */}
      <mesh position={[0, 1.1, house.d / 2 + 0.06]}>
        <boxGeometry args={[1.4, 2.2, 0.12]} />
        <meshStandardMaterial color={DOOR} roughness={0.85} />
      </mesh>
      {[-house.w / 4, house.w / 4].map((wx) => (
        <mesh key={wx} position={[wx, house.h * 0.55, house.d / 2 + 0.06]}>
          <boxGeometry args={[1.4, 1.4, 0.1]} />
          <meshStandardMaterial
            color={GLASS}
            emissive="#ffe9b8"
            emissiveIntensity={0.5}
            roughness={0.2}
          />
        </mesh>
      ))}
      {/* Chimney */}
      <mesh position={[house.w / 4, house.h + 1.2, -house.d / 4]} castShadow>
        <boxGeometry args={[0.8, 2, 0.8]} />
        <meshStandardMaterial color="#8d8d94" roughness={1} />
      </mesh>
    </group>
  );
}

export default function Village() {
  const sign = useMemo(() => makeVillageSignTexture(), []);
  const [cx, , cz] = VILLAGE_CENTER;

  return (
    <group>
      {VILLAGE_HOUSES.map((h, i) => (
        <House key={i} house={h} />
      ))}

      {/* Central well plaza */}
      <mesh position={[cx, 0.03, cz]} receiveShadow>
        <cylinderGeometry args={[8, 8, 0.08, 24]} />
        <meshStandardMaterial color="#b8a888" roughness={1} />
      </mesh>
      <group position={[cx, 0, cz]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <cylinderGeometry args={[1.2, 1.3, 1, 12]} />
          <meshStandardMaterial color="#8d8d94" roughness={1} />
        </mesh>
        {[-1.1, 1.1].map((x) => (
          <mesh key={x} position={[x, 1.6, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.09, 2.4, 8]} />
            <meshStandardMaterial color={WOOD} roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[0, 3.1, 0]} rotation-y={Math.PI / 4} castShadow>
          <coneGeometry args={[1.9, 1.1, 4]} />
          <meshStandardMaterial color="#7a4a3a" roughness={0.9} flatShading />
        </mesh>
      </group>

      {/* Fences along the main path */}
      {[-14, -6, 2, 10].map((z) => (
        <group key={z}>
          <mesh position={[cx - 12, 0.5, cz + z]} castShadow>
            <boxGeometry args={[0.15, 1, 6]} />
            <meshStandardMaterial color={WOOD} roughness={0.95} />
          </mesh>
          <mesh position={[cx + 12, 0.5, cz + z]} castShadow>
            <boxGeometry args={[0.15, 1, 6]} />
            <meshStandardMaterial color={WOOD} roughness={0.95} />
          </mesh>
        </group>
      ))}

      {/* Hand-placed trees */}
      {VILLAGE_TREES.map((t, i) => (
        <group key={i} position={[cx + t.dx, 0, cz + t.dz]} scale={t.s}>
          <mesh position={[0, 0.9, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.32, 1.8, 6]} />
            <meshStandardMaterial color="#7a5230" roughness={1} flatShading />
          </mesh>
          <mesh position={[0, 3.1, 0]} castShadow>
            <coneGeometry args={[1.6, 3.4, 7]} />
            <meshStandardMaterial color="#3f7d36" roughness={1} flatShading />
          </mesh>
        </group>
      ))}

      {/* Entrance sign (faces west toward spawn) */}
      <group position={[cx - 34, 0, cz]} rotation-y={-Math.PI / 2}>
        {[-2.2, 2.2].map((x) => (
          <mesh key={x} position={[x, 1.4, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.14, 2.8, 8]} />
            <meshStandardMaterial color={WOOD} roughness={0.9} />
          </mesh>
        ))}
        {sign && (
          <mesh position={[0, 2.4, 0]}>
            <planeGeometry args={[6.4, 1.6]} />
            <meshStandardMaterial map={sign} roughness={0.85} />
          </mesh>
        )}
      </group>
    </group>
  );
}
