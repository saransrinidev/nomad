// THANJAVUR at map center: a dense city core of brick/tiled buildings around
// the central plaza, surrounded by villages (hamlets of thatched mud huts) on
// a wide ring. A dirt road network links the city out to every village.
// Fully static, generated from lib/game/map/village.ts.

"use client";

import { useMemo } from "react";
import * as THREE from "three";
import {
  BUILDING_TYPES,
  SURROUNDING_VILLAGES,
  VILLAGE_CENTER,
  VILLAGE_HOUSES,
  VILLAGE_NAME,
  VILLAGE_ROADS,
  VILLAGE_SIGN,
  VILLAGE_TREES,
  VILLAGE_WELL,
  type BuildingType,
  type VillageHouse,
} from "@/lib/game/map/village";

const DOOR = "#3d2b1a";
const GLASS = "#ffe9b8";
const WOOD = "#6b4a2f";
const DIRT_ROAD = "#9a7d55";

// Cache one shop-sign texture per building type (label on its accent color).
const signCache = new Map<BuildingType, THREE.CanvasTexture | null>();
function shopSignTexture(type: BuildingType): THREE.CanvasTexture | null {
  if (signCache.has(type)) return signCache.get(type)!;
  if (typeof document === "undefined") return null;
  const info = BUILDING_TYPES[type];
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = info.accent;
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(info.label.toUpperCase(), 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  signCache.set(type, tex);
  return tex;
}

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
  ctx.font = "bold 52px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(VILLAGE_NAME, 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function Hut({ house }: { house: VillageHouse }) {
  const [cx, , cz] = VILLAGE_CENTER;
  const x = cx + house.dx;
  const z = cz + house.dz;
  const isCity = house.kind === "city";
  const roofR = Math.hypot(house.w, house.d) / 2 + 0.9;

  // City blocks get stacked window rows; village huts get a single row.
  const rows = isCity ? Math.max(2, Math.round(house.h / 2.4)) : 1;

  const info = BUILDING_TYPES[house.type];
  const showSign = house.type !== "house";
  const sign = showSign ? shopSignTexture(house.type) : null;
  const faceZ = house.d / 2 + 0.07;
  // Sign band sits above the door, below the roof line.
  const bandY = Math.min(house.h - 0.6, house.h * 0.78);

  return (
    <group position={[x, 0, z]}>
      {/* Walls */}
      <mesh position={[0, house.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[house.w, house.h, house.d]} />
        <meshStandardMaterial color={house.wall} roughness={1} />
      </mesh>

      {isCity ? (
        <>
          {/* Low hipped terracotta roof + flat tiled cap for a town look */}
          <mesh position={[0, house.h + 0.9, 0]} rotation-y={Math.PI / 4} castShadow>
            <coneGeometry args={[roofR, 1.8, 4]} />
            <meshStandardMaterial color={house.roof} roughness={1} flatShading />
          </mesh>
          <mesh position={[0, house.h + 0.1, 0]} castShadow>
            <boxGeometry args={[house.w + 0.4, 0.3, house.d + 0.4]} />
            <meshStandardMaterial color={house.roof} roughness={1} />
          </mesh>
        </>
      ) : (
        /* Thatched pyramid roof with wide overhang */
        <mesh position={[0, house.h + 1.0, 0]} rotation-y={Math.PI / 4} castShadow>
          <coneGeometry args={[roofR, 2.2, 4]} />
          <meshStandardMaterial color={house.roof} roughness={1} flatShading />
        </mesh>
      )}

      {/* Door on the +Z face */}
      <mesh position={[0, 0.9, house.d / 2 + 0.06]}>
        <boxGeometry args={[1.2, 1.8, 0.12]} />
        <meshStandardMaterial color={DOOR} roughness={0.9} />
      </mesh>

      {/* Accent facade band + shop sign on the +Z face (not for plain homes) */}
      {showSign && (
        <>
          <mesh position={[0, bandY, faceZ]}>
            <boxGeometry args={[house.w * 0.92, 0.5, 0.08]} />
            <meshStandardMaterial
              color={info.accent}
              emissive={info.accent}
              emissiveIntensity={0.35}
              roughness={0.7}
            />
          </mesh>
          {sign && (
            <mesh position={[0, bandY, faceZ + 0.06]}>
              <planeGeometry args={[Math.min(house.w * 0.8, 4), 0.9]} />
              <meshStandardMaterial map={sign} transparent roughness={0.8} />
            </mesh>
          )}
        </>
      )}

      {/* Window rows on the +Z face */}
      {Array.from({ length: rows }).flatMap((_, r) =>
        [-house.w / 4, house.w / 4].map((wx) => (
          <mesh
            key={`${r}-${wx}`}
            position={[wx, (isCity ? 1.6 + r * 2.2 : house.h * 0.55), house.d / 2 + 0.06]}
          >
            <boxGeometry args={[1.0, 1.0, 0.1]} />
            <meshStandardMaterial
              color={GLASS}
              emissive="#ffdf9e"
              emissiveIntensity={0.55}
              roughness={0.3}
            />
          </mesh>
        )),
      )}
    </group>
  );
}

export default function Village() {
  const sign = useMemo(() => makeVillageSignTexture(), []);
  const [cx, , cz] = VILLAGE_CENTER;
  const wellX = cx + VILLAGE_WELL.dx;
  const wellZ = cz + VILLAGE_WELL.dz;
  const signX = cx + VILLAGE_SIGN.dx;
  const signZ = cz + VILLAGE_SIGN.dz;

  return (
    <group>
      {VILLAGE_HOUSES.map((h, i) => (
        <Hut key={i} house={h} />
      ))}

      {/* Connecting dirt network: radial spokes + a ring road per hut ring.
          Slight per-segment height stagger avoids z-fighting at crossings. */}
      {VILLAGE_ROADS.map((r, i) => (
        <mesh
          key={i}
          position={[cx + r.x, 0.02 + (i % 2) * 0.01, cz + r.z]}
          receiveShadow
        >
          <boxGeometry args={[r.w, 0.05, r.d]} />
          <meshStandardMaterial color={DIRT_ROAD} roughness={1} />
        </mesh>
      ))}

      {/* Central plaza */}
      <mesh position={[cx, 0.015, cz]} receiveShadow>
        <cylinderGeometry args={[9, 9, 0.06, 24]} />
        <meshStandardMaterial color="#b8a888" roughness={1} />
      </mesh>

      {/* Well */}
      <group position={[wellX, 0, wellZ]}>
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
          <meshStandardMaterial color="#7a5a3a" roughness={1} flatShading />
        </mesh>
      </group>

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

      {/* Focal shrine at each surrounding village center */}
      {SURROUNDING_VILLAGES.map((v, i) => (
        <group key={`vc-${i}`} position={[cx + v.dx, 0, cz + v.dz]}>
          {/* Small stone platform */}
          <mesh position={[0, 0.1, 0]} receiveShadow>
            <cylinderGeometry args={[3.2, 3.4, 0.2, 16]} />
            <meshStandardMaterial color="#b0a07e" roughness={1} />
          </mesh>
          {/* Shrine post */}
          <mesh position={[0, 1.3, 0]} castShadow>
            <cylinderGeometry args={[0.4, 0.5, 2.4, 8]} />
            <meshStandardMaterial color={WOOD} roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.9, 0]} rotation-y={Math.PI / 4} castShadow>
            <coneGeometry args={[1.0, 1.0, 4]} />
            <meshStandardMaterial color="#7a5a3a" roughness={1} flatShading />
          </mesh>
        </group>
      ))}

      {/* Entrance sign on the west road (faces incoming spawn direction) */}
      <group position={[signX, 0, signZ]} rotation-y={-Math.PI / 2}>
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
