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
  COACH_LEN,
  LINES,
  LOCO_LEN,
  trainCarCenters,
  updateTrains,
} from "@/lib/game/map/railway";
import { groundHeight } from "@/lib/game/map/terrain";
import type { GameWorld } from "@/lib/game/state";

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

function CoachShell() {
  // Hollow shell (4 m wide, taller): floor, lower panels with 1.8 m doorway
  // gaps at z=±4.5 on each side, pillars, open window band, top rails, roof,
  // end walls, doorway bridge plates, ceiling light strips.
  const HW = 2.0;
  const side = (sx: 1 | -1) => (
    <group key={sx}>
      {/* Lower panels with doorway gaps spanning z ±[3.6, 5.4] */}
      {[
        { z: -5.7, len: 0.6 },
        { z: 0, len: 7.2 },
        { z: 5.7, len: 0.6 },
      ].map((p, i) => (
        <mesh key={i} position={[sx * (HW - 0.1), 1.3, p.z]} castShadow>
          <boxGeometry args={[0.1, 0.8, p.len]} />
          <meshStandardMaterial color="#1f4e9c" roughness={0.6} />
        </mesh>
      ))}
      {/* Door pockets (open sliding doors) */}
      {[-2.8, 2.8].map((z) => (
        <mesh key={z} position={[sx * (HW + 0.02), 1.3, z]} castShadow>
          <boxGeometry args={[0.06, 0.8, 1.6]} />
          <meshStandardMaterial color="#16386e" roughness={0.6} />
        </mesh>
      ))}
      {/* Bridge plates spanning the platform gap at each doorway */}
      {[-4.5, 4.5].map((z) => (
        <mesh key={z} position={[sx * (HW + 0.45), 0.9, z]} receiveShadow>
          <boxGeometry args={[1.1, 0.1, 1.8]} />
          <meshStandardMaterial color="#8d939c" roughness={0.7} metalness={0.3} />
        </mesh>
      ))}
      {/* Pillars between the windows (clear of the doorway spans) */}
      {[-5.7, -2, 0, 2, 5.7].map((z) => (
        <mesh key={z} position={[sx * (HW - 0.1), 2.35, z]} castShadow>
          <boxGeometry args={[0.12, 1.1, 0.18]} />
          <meshStandardMaterial color="#1f4e9c" roughness={0.6} />
        </mesh>
      ))}
      {/* Top rail above the open band */}
      <mesh position={[sx * (HW - 0.1), 3.0, 0]} castShadow>
        <boxGeometry args={[0.1, 0.2, COACH_LEN]} />
        <meshStandardMaterial color="#1f4e9c" roughness={0.6} />
      </mesh>
    </group>
  );
  return (
    <group>
      {/* Floor */}
      <mesh position={[0, 0.875, 0]} receiveShadow>
        <boxGeometry args={[3.9, 0.15, COACH_LEN]} />
        <meshStandardMaterial color="#6a6258" roughness={0.9} />
      </mesh>
      {side(1)}
      {side(-1)}
      {/* End walls with gangway doors */}
      {[COACH_LEN / 2, -COACH_LEN / 2].map((z) => (
        <group key={z}>
          <mesh position={[0, 2.0, z]} castShadow>
            <boxGeometry args={[3.9, 2.2, 0.12]} />
            <meshStandardMaterial color="#1f4e9c" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.85, z + Math.sign(z) * 0.04]}>
            <boxGeometry args={[1.0, 1.8, 0.06]} />
            <meshStandardMaterial color="#10161f" roughness={0.7} />
          </mesh>
        </group>
      ))}
      {/* Roof */}
      <mesh position={[0, 3.2, 0]} castShadow>
        <boxGeometry args={[3.9, 0.2, COACH_LEN]} />
        <meshStandardMaterial color="#9aa0a8" roughness={0.7} />
      </mesh>
      {/* Ceiling light strips */}
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, 3.02, 0]}>
          <boxGeometry args={[0.3, 0.06, 10]} />
          <meshStandardMaterial
            color="#fff6dc"
            emissive="#ffeeb8"
            emissiveIntensity={1.6}
          />
        </mesh>
      ))}
      {/* Interior cabin light (one shadowless point per coach) */}
      <pointLight position={[0, 2.5, 0]} color="#ffdfb0" intensity={15} distance={10} decay={2} />
    </group>
  );
}

function CoachInterior() {
  // Seats both sides (anchors live at z=-1.5) + one spare row, one berth.
  return (
    <group>
      {[-1.5, 1.0].map((z) =>
        [-1.1, 1.1].map((x) => (
          <group key={`${x}-${z}`}>
            <mesh position={[x, 1.25, z]} castShadow>
              <boxGeometry args={[0.6, 0.5, 0.6]} />
              <meshStandardMaterial color="#7a2e2e" roughness={0.85} />
            </mesh>
            <mesh position={[x, 1.55, z - 0.36]} castShadow>
              <boxGeometry args={[0.6, 0.7, 0.14]} />
              <meshStandardMaterial color="#7a2e2e" roughness={0.85} />
            </mesh>
          </group>
        )),
      )}
      {/* Side lower berth (anchor at z=+2.8, x=-1.1) */}
      <mesh position={[-1.1, 1.6, 2.8]} castShadow>
        <boxGeometry args={[0.9, 0.2, 2.0]} />
        <meshStandardMaterial color="#2e5e7a" roughness={0.85} />
      </mesh>
      <mesh position={[-1.1, 1.78, 2.8]}>
        <boxGeometry args={[0.8, 0.08, 1.9]} />
        <meshStandardMaterial color="#d8d2c2" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Coach({ last }: { last: boolean }) {
  return (
    <group>
      <CoachShell />
      <CoachInterior />
      {/* Tail lamp on the last coach */}
      {last && (
        <mesh position={[0, 2.4, -COACH_LEN / 2 - 0.06]}>
          <boxGeometry args={[0.5, 0.4, 0.1]} />
          <meshStandardMaterial color="#7a1010" emissive="#c02020" emissiveIntensity={0.8} />
        </mesh>
      )}
      <Wheels len={COACH_LEN} />
    </group>
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
            {i === 0 ? <Loco /> : <Coach last={i === line.coachCount} />}
          </group>
        )),
      )}
    </group>
  );
}
