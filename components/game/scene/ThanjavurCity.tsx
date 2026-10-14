// First district hub for Milewalker: a procedural Thanjavur city ring around
// a reserved landmark plaza. The kit is deliberately data-driven so the same
// layout can later be reused for the other district centres.

"use client";

import { useMemo } from "react";
import { latLonToGame } from "@/lib/game/map/tamilnadu";
import { groundHeight } from "@/lib/game/map/terrain";

const CENTER = latLonToGame(79.2, 10.79);
const CITY_SIZE = 1100;
const ROAD = 18;

type Building = { x: number; z: number; w: number; d: number; h: number; color: string };

function cityBuildings(): Building[] {
  const colors = ["#c77b4a", "#d79b5c", "#a95e46", "#d1b37a", "#8e9b91"];
  const out: Building[] = [];
  let seed = 11;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let gx = -4; gx <= 4; gx++) {
    for (let gz = -4; gz <= 4; gz++) {
      const x = gx * 118 + (rand() - 0.5) * 22;
      const z = gz * 118 + (rand() - 0.5) * 22;
      if (Math.abs(x) < 170 && Math.abs(z) < 170) continue;
      if (Math.abs(x) % 118 < ROAD || Math.abs(z) % 118 < ROAD) continue;
      const shops = Math.abs(gx) <= 2 && Math.abs(gz) <= 2;
      out.push({
        x: CENTER.x + x,
        z: CENTER.z + z,
        w: shops ? 42 : 52 + rand() * 24,
        d: shops ? 30 : 48 + rand() * 20,
        h: shops ? 7 + rand() * 5 : 9 + rand() * 16,
        color: colors[Math.floor(rand() * colors.length)],
      });
    }
  }
  return out;
}

function GroundBlock({ position, size, color }: { position: [number, number, number]; size: [number, number, number]; color: string }) {
  return (
    <mesh position={position} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.92} />
    </mesh>
  );
}

function TamilHouse({ x, z, w, d, h, modern, color, rotation = 0 }: { x: number; z: number; w: number; d: number; h: number; modern: boolean; color: string; rotation?: number }) {
  return (
    <group position={[x, groundHeight(x, z), z]} rotation-y={rotation}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      {!modern ? (
        <mesh position={[0, h + 0.22, 0]} rotation-z={0.08} castShadow>
          <boxGeometry args={[w + 0.25, 0.32, d + 0.3]} />
          <meshStandardMaterial color="#9b3f2d" roughness={0.96} />
        </mesh>
      ) : (
        <mesh position={[0, h + 0.12, 0]}>
          <boxGeometry args={[w + 0.18, 0.24, d + 0.18]} />
          <meshStandardMaterial color="#e7d3a5" roughness={0.88} />
        </mesh>
      )}
      <mesh position={[0, 1.15, d / 2 + 0.02]}>
        <boxGeometry args={[Math.min(1.7, w * 0.35), 1.5, 0.06]} />
        <meshStandardMaterial color="#4d3025" roughness={0.82} />
      </mesh>
      <mesh position={[0, 1.8, d / 2 + 0.045]}>
        <boxGeometry args={[Math.min(2.3, w * 0.55), 0.55, 0.04]} />
        <meshStandardMaterial color="#243642" roughness={0.7} />
      </mesh>
      {!modern && <mesh position={[0, 0.36, d / 2 + 0.7]}>
        <boxGeometry args={[w * 0.72, 0.12, 1.2]} />
        <meshStandardMaterial color="#d7b27a" roughness={0.94} />
      </mesh>}
      <group position={[0, 0.12, d / 2 + 1.3]}>
        <GroundBlock position={[-w * 0.58, 0, 0]} size={[0.12, 0.55, 2.8]} color="#b9b0a0" />
        <GroundBlock position={[w * 0.58, 0, 0]} size={[0.12, 0.55, 2.8]} color="#b9b0a0" />
        <GroundBlock position={[0, 0, 1.34]} size={[w * 1.2, 0.55, 0.12]} color="#b9b0a0" />
      </group>
    </group>
  );
}

function VillageCluster({ cx, cz, seed }: { cx: number; cz: number; seed: number }) {
  const houses = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const a = (i * 2.399 + seed) % (Math.PI * 2);
    const r = 68 + (i % 4) * 19;
    return {
      x: cx + Math.cos(a) * r,
      z: cz + Math.sin(a) * r,
      w: 16 + (i % 3) * 3,
      d: 12 + (i % 2) * 4,
      h: i % 4 === 0 ? 6.8 : 4.4,
      modern: i % 3 === 0,
      color: ["#f0dfbd", "#cfe0d2", "#f0c58e", "#e8b9ae"][i % 4],
      rotation: a + Math.PI / 2,
    };
  }), [cx, cz, seed]);
  return (
    <group>
      {houses.map((h, i) => <TamilHouse key={i} {...h} />)}
      <mesh position={[cx, groundHeight(cx, cz) + 0.08, cz]}>
        <cylinderGeometry args={[13, 13, 0.16, 24]} />
        <meshStandardMaterial color="#c7ad7d" roughness={1} />
      </mesh>
      <mesh position={[cx, groundHeight(cx, cz) + 2.2, cz]}>
        <cylinderGeometry args={[0.25, 0.38, 4.3, 8]} />
        <meshStandardMaterial color="#7b4c2f" roughness={1} />
      </mesh>
      <mesh position={[cx, groundHeight(cx, cz) + 4.8, cz]}>
        <coneGeometry args={[2.2, 3.1, 8]} />
        <meshStandardMaterial color="#3e7d46" roughness={1} flatShading />
      </mesh>
    </group>
  );
}

function DeltaFields() {
  const plots = [
    [-1700, -530, 620, 320], [1700, 430, 720, 360], [-1320, 1120, 480, 300], [1320, -1120, 520, 280],
  ] as const;
  return <group>
    {plots.map(([x, z, w, d], i) => (
      <group key={i}>
        <mesh position={[CENTER.x + x, groundHeight(CENTER.x + x, CENTER.z + z) + 0.03, CENTER.z + z]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color="#799d4a" roughness={1} />
        </mesh>
        <GroundBlock position={[CENTER.x + x, 2.08, CENTER.z + z - d / 2]} size={[w, 0.12, 2.5]} color="#8e7042" />
        <GroundBlock position={[CENTER.x + x, 2.08, CENTER.z + z + d / 2]} size={[w, 0.12, 2.5]} color="#8e7042" />
        {[-1, 0, 1].map((j) => (
          <group key={j} position={[CENTER.x + x + j * (w / 3), 2, CENTER.z + z]}>
            <mesh position={[0, 2.6, 0]}>
              <cylinderGeometry args={[0.18, 0.28, 5.2, 7]} />
              <meshStandardMaterial color="#76502e" roughness={1} />
            </mesh>
            <mesh position={[0, 5.3, 0]}>
              <sphereGeometry args={[1.8, 7, 5]} />
              <meshStandardMaterial color="#3b824c" roughness={1} flatShading />
            </mesh>
          </group>
        ))}
      </group>
    ))}
  </group>;
}

export default function ThanjavurCity() {
  const buildings = useMemo(() => cityBuildings(), []);
  const ground = groundHeight(CENTER.x, CENTER.z);
  const trees = useMemo(() => Array.from({ length: 68 }, (_, i) => {
    const angle = (i / 68) * Math.PI * 2;
    const radius = 570 + (i % 5) * 36;
    return [CENTER.x + Math.cos(angle) * radius, CENTER.z + Math.sin(angle) * radius] as const;
  }), []);

  return (
    <group>
      {/* Broad roads create a readable city grid around the reserved plaza. */}
      {[-472, -236, 0, 236, 472].map((offset) => (
        <group key={`road-${offset}`}>
          <GroundBlock position={[CENTER.x + offset, ground + 0.04, CENTER.z]} size={[ROAD, 0.08, CITY_SIZE]} color="#30363a" />
          <GroundBlock position={[CENTER.x, ground + 0.045, CENTER.z + offset]} size={[CITY_SIZE, 0.08, ROAD]} color="#30363a" />
          <GroundBlock position={[CENTER.x + offset - ROAD * 0.58, ground + 0.09, CENTER.z]} size={[0.12, 0.025, CITY_SIZE]} color="#dfc87b" />
          <GroundBlock position={[CENTER.x, ground + 0.095, CENTER.z + offset - ROAD * 0.58]} size={[CITY_SIZE, 0.025, 0.12]} color="#dfc87b" />
        </group>
      ))}

      {/* Reserved Thanjavur landmark plaza: empty for the final landmark build. */}
      <mesh position={[CENTER.x, ground + 0.08, CENTER.z]} receiveShadow>
        <cylinderGeometry args={[150, 150, 0.16, 48]} />
        <meshStandardMaterial color="#b99a70" roughness={0.95} />
      </mesh>
      <mesh position={[CENTER.x, ground + 0.17, CENTER.z]}>
        <ringGeometry args={[142, 145, 48]} />
        <meshStandardMaterial color="#e0b85e" emissive="#5d3a16" emissiveIntensity={0.18} />
      </mesh>

      {buildings.map((b, i) => (
        <group key={`building-${i}`}>
          <GroundBlock position={[b.x, ground + b.h / 2, b.z]} size={[b.w, b.h, b.d]} color={b.color} />
          <mesh position={[b.x, ground + b.h + 0.12, b.z]}>
            <boxGeometry args={[b.w + 1, 0.22, b.d + 1]} />
            <meshStandardMaterial color="#6e4933" roughness={0.9} />
          </mesh>
          {i % 3 === 0 && <mesh position={[b.x, ground + 1.5, b.z - b.d / 2 - 0.04]}>
            <boxGeometry args={[Math.min(b.w * 0.75, 24), 1.5, 0.08]} />
            <meshStandardMaterial color="#f0c861" emissive="#d16b20" emissiveIntensity={0.35} />
          </mesh>}
        </group>
      ))}

      {trees.map(([x, z], i) => (
        <group key={`tree-${i}`} position={[x, ground, z]}>
          <mesh position={[0, 2.2, 0]} castShadow>
            <cylinderGeometry args={[0.25, 0.38, 4.4, 7]} />
            <meshStandardMaterial color="#69452a" roughness={1} />
          </mesh>
          <mesh position={[0, 4.9, 0]} castShadow>
            <sphereGeometry args={[2.5 + (i % 3) * 0.35, 8, 6]} />
            <meshStandardMaterial color={i % 3 ? "#317747" : "#4f914c"} roughness={1} flatShading />
          </mesh>
        </group>
      ))}
      <VillageCluster cx={CENTER.x - 880} cz={CENTER.z - 220} seed={1} />
      <VillageCluster cx={CENTER.x + 900} cz={CENTER.z + 240} seed={4} />
      <VillageCluster cx={CENTER.x - 420} cz={CENTER.z + 980} seed={8} />
      <DeltaFields />
    </group>
  );
}
