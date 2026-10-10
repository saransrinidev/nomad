// Railway consists, one per line: loco + coaches running their curves with
// station dwells. Coaches are hollow (open window band both sides) with
// seats + berths so the player can ride inside. Simulation (arc distance,
// direction, dwell) lives in lib/game/map/railway.ts and writes poses into
// GameWorld (also used by the 2D maps + train collision + boarding).

"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  LINES,
  LOCO_LEN,
  trainCarCenters,
  updateTrains,
} from "@/lib/game/map/railway";
import { groundHeight } from "@/lib/game/map/terrain";
import type { GameWorld } from "@/lib/game/state";
import IndianRailwayCoach from "./IndianRailwayCoach";

const CAR_W = 4;
const LOCO_H = 3.4;

function Wheels({ len }: { len: number }) {
  // Two bogies per car, one visible disc pair each side.
  return (
    <group>
      {[-len / 2 + 2, len / 2 - 2].map((z) => (
        <group key={z} position={[0, 0.55, z]}>
          <mesh castShadow>
            <boxGeometry args={[3.2, 0.7, 2.2]} />
            <meshStandardMaterial color="#22252a" roughness={0.9} />
          </mesh>
          {[-1.7, 1.7].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation-z={Math.PI / 2}>
              <cylinderGeometry args={[0.5, 0.5, 0.2, 12]} />
              <meshStandardMaterial color="#15171b" roughness={0.7} metalness={0.4} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Loco() {
  return (
    <group>
      {/* Body */}
      <mesh position={[0, 2.3, 0]} castShadow>
        <boxGeometry args={[CAR_W, LOCO_H, LOCO_LEN]} />
        <meshStandardMaterial color="#a93226" roughness={0.6} />
      </mesh>
      {/* Yellow nose */}
      <mesh position={[0, 1.9, LOCO_LEN / 2 + 0.02]}>
        <boxGeometry args={[3.2, 1.6, 0.1]} />
        <meshStandardMaterial color="#f5c518" roughness={0.6} />
      </mesh>
      {/* Cab windows */}
      <mesh position={[0, 3.1, LOCO_LEN / 2 + 0.02]}>
        <boxGeometry args={[3.0, 0.9, 0.1]} />
        <meshStandardMaterial color="#10161f" roughness={0.2} metalness={0.4} />
      </mesh>
      {[-2.01, 2.01].map((x) => (
        <mesh key={x} position={[x, 3.1, 2]}>
          <boxGeometry args={[0.06, 0.9, 5]} />
          <meshStandardMaterial color="#10161f" roughness={0.2} metalness={0.4} />
        </mesh>
      ))}
      {/* Roof + pantograph */}
      <mesh position={[0, 4.1, 0]}>
        <boxGeometry args={[3.4, 0.25, LOCO_LEN - 2]} />
        <meshStandardMaterial color="#3a3f45" roughness={0.8} />
      </mesh>
      {[-3, 3].map((z) => (
        <mesh key={z} position={[0, 4.7, z]} rotation-x={0.5}>
          <boxGeometry args={[0.12, 1.4, 0.12]} />
          <meshStandardMaterial color="#22252a" roughness={0.7} metalness={0.5} />
        </mesh>
      ))}
      {/* Headlight */}
      <mesh position={[0, 2.9, LOCO_LEN / 2 + 0.06]}>
        <boxGeometry args={[0.7, 0.5, 0.1]} />
        <meshStandardMaterial
          color="#fffbe8"
          emissive="#fff3c0"
          emissiveIntensity={1.2}
        />
      </mesh>
      {/* Tail lamp */}
      <mesh position={[0, 2.9, -LOCO_LEN / 2 - 0.06]}>
        <boxGeometry args={[0.5, 0.4, 0.1]} />
        <meshStandardMaterial color="#7a1010" emissive="#c02020" emissiveIntensity={0.8} />
      </mesh>
      <Wheels len={LOCO_LEN} />
    </group>
  );
}

function Coach({ last, lineId, carIndex, worldRef }: { last: boolean; lineId: string; carIndex: number; worldRef: RefObject<GameWorld> }) {
  // Blue ICF-style general coach (coach numbers vary per position).
  return (
    <IndianRailwayCoach
      last={last}
      lineId={lineId}
      carIndex={carIndex}
      coachNumber={`0820${carIndex}`}
      worldRef={worldRef}
    />
  );
}

export default function Train({ worldRef }: { worldRef: RefObject<GameWorld> }) {
  const carRefs = useRef(new Map<string, THREE.Group | null>());

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const world = worldRef.current;
    if (world.paused) return;
    updateTrains(world, dt);
    for (const t of world.trains) {
      const cars = trainCarCenters(t.line, t.s, t.dir);
      for (let i = 0; i < cars.length; i++) {
        const g = carRefs.current.get(`${t.line}:${i}`);
        if (!g) continue;
        const c = cars[i];
        g.position.set(c.x, groundHeight(c.x, c.z), c.z);
        g.rotation.set(0, c.yaw, 0);
      }
    }
  });

  return (
    <group>
      {LINES.map((line) =>
        Array.from({ length: line.coachCount + 1 }).map((_, i) => (
          <group
            key={`${line.id}:${i}`}
            ref={(g) => {
              carRefs.current.set(`${line.id}:${i}`, g);
            }}
          >
            {i === 0 ? <Loco /> : <Coach last={i === line.coachCount} lineId={line.id} carIndex={i} worldRef={worldRef} />}
          </group>
        )),
      )}
    </group>
  );
}
