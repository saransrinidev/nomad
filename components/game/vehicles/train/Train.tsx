// Railway consists, one per line: loco + coaches running their curves with
// station dwells. Coaches are hollow (open window band both sides) with
// seats + berths so the player can ride inside. Simulation (arc distance,
// direction, dwell) lives in lib/game/map/railway.ts and writes poses into
// GameWorld (also used by the 2D maps + train collision + boarding).

"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  LINES,
  LOCO_LEN,
  coachInteriorAt,
  consistLength,
  getLine,
  trackDeckAt,
  trackPointAt,
  trainCarCenters,
  updateTrains,
} from "@/lib/game/map/railway";
import type { GameWorld } from "@/lib/game/state";
import IndianRailwayCoach from "./IndianRailwayCoach";

const CAR_W = 4;

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

function Loco({ flip = false }: { flip?: boolean }) {
  // Indian WAP-7 style electric loco: deep-red body, cream stripe, black
  // windshield bands (cabs both ends), twin pantographs, yellow warning
  // panel + bright nose lamps. Footprint unchanged (4 x 14 m) so collision
  // constants still match exactly. The rear engine renders flipped so its
  // nose + white headlights face outward — push-pull needs no turning.
  return (
    <group>
      <group rotation-y={flip ? Math.PI : 0}>
      {/* Underframe + buffer beams */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[3.4, 0.5, 12.5]} />
        <meshStandardMaterial color="#22252a" roughness={0.9} />
      </mesh>
      {[LOCO_LEN / 2 + 0.1, -LOCO_LEN / 2 - 0.1].map((z) => (
        <mesh key={z} position={[0, 0.9, z]}>
          <boxGeometry args={[3.8, 0.4, 0.3]} />
          <meshStandardMaterial color="#7a1f1a" roughness={0.8} />
        </mesh>
      ))}
      {/* Cowcatcher pilot */}
      <mesh position={[0, 0.45, LOCO_LEN / 2 + 0.35]} rotation-x={0.45}>
        <boxGeometry args={[3.2, 0.7, 0.5]} />
        <meshStandardMaterial color="#2b2e34" roughness={0.9} />
      </mesh>
      {/* Main red body */}
      <mesh position={[0, 2.35, 0]} castShadow>
        <boxGeometry args={[CAR_W, 3.5, LOCO_LEN]} />
        <meshStandardMaterial color="#a93226" roughness={0.55} />
      </mesh>
      {/* Cream stripes (sides + front) */}
      {[-2.01, 2.01].map((x) => (
        <mesh key={x} position={[x, 2.9, 0]}>
          <boxGeometry args={[0.06, 0.5, 13]} />
          <meshStandardMaterial color="#f3e3c2" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 2.9, LOCO_LEN / 2 + 0.02]}>
        <boxGeometry args={[3.4, 0.5, 0.06]} />
        <meshStandardMaterial color="#f3e3c2" roughness={0.6} />
      </mesh>
      {/* Yellow warning panel (front lower) */}
      <mesh position={[0, 1.5, LOCO_LEN / 2 + 0.02]}>
        <boxGeometry args={[3.4, 1.0, 0.06]} />
        <meshStandardMaterial color="#f5c518" roughness={0.6} />
      </mesh>
      {/* Windshield bands (both cabs): black band + twin glass + pillar */}
      {[LOCO_LEN / 2 + 0.02, -LOCO_LEN / 2 - 0.02].map((z, ci) => (
        <group key={ci} position={[0, 3.4, z]}>
          <mesh>
            <boxGeometry args={[3.4, 0.9, 0.08]} />
            <meshStandardMaterial color="#14181d" roughness={0.7} />
          </mesh>
          {[-0.8, 0.8].map((x) => (
            <mesh key={x} position={[x, 0, ci === 0 ? 0.03 : -0.03]}>
              <boxGeometry args={[1.3, 0.62, 0.06]} />
              <meshStandardMaterial color="#10161f" roughness={0.15} metalness={0.5} />
            </mesh>
          ))}
          <mesh>
            <boxGeometry args={[0.18, 0.9, 0.1]} />
            <meshStandardMaterial color="#a93226" roughness={0.6} />
          </mesh>
        </group>
      ))}
      {/* Cab side windows */}
      {[-2.01, 2.01].map((x) =>
        [3.4, -3.4].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 3.4, z]}>
            <boxGeometry args={[0.06, 0.7, 1.8]} />
            <meshStandardMaterial color="#10161f" roughness={0.2} metalness={0.4} />
          </mesh>
        )),
      )}
      {/* Side vent grills */}
      {[-2.01, 2.01].map((x) => (
        <group key={x}>
          <mesh position={[x, 2.1, 0]}>
            <boxGeometry args={[0.06, 1.0, 4.5]} />
            <meshStandardMaterial color="#22262b" roughness={0.8} />
          </mesh>
          {[-0.25, 0, 0.25].map((dy) => (
            <mesh key={dy} position={[x * 1.005, 2.1 + dy, 0]}>
              <boxGeometry args={[0.04, 0.06, 4.5]} />
              <meshStandardMaterial color="#3a3f45" roughness={0.7} metalness={0.3} />
            </mesh>
          ))}
        </group>
      ))}
      {/* WAP-7 number boards */}
      {[-2.02, 2.02].map((x) => (
        <mesh key={x} position={[x, 2.35, 4.6]}>
          <boxGeometry args={[0.05, 0.4, 1.4]} />
          <meshStandardMaterial color="#f3e3c2" roughness={0.6} />
        </mesh>
      ))}
      {/* Roof */}
      <mesh position={[0, 4.2, 0]}>
        <boxGeometry args={[3.5, 0.25, LOCO_LEN - 1.5]} />
        <meshStandardMaterial color="#3a3f45" roughness={0.8} />
      </mesh>
      {/* Twin pantographs (diamond frames + contact strips) */}
      {[-3.2, 3.2].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, 4.38, 0]}>
            <boxGeometry args={[1.6, 0.1, 1.2]} />
            <meshStandardMaterial color="#22252a" roughness={0.7} metalness={0.5} />
          </mesh>
          {[-0.55, 0.55].map((x) => (
            <group key={x}>
              <mesh position={[x * 0.6, 4.9, 0]} rotation-z={-x * 0.55}>
                <boxGeometry args={[0.08, 1.2, 0.08]} />
                <meshStandardMaterial color="#22252a" roughness={0.7} metalness={0.5} />
              </mesh>
              <mesh position={[x * 0.25, 5.5, 0]} rotation-z={x * 0.7}>
                <boxGeometry args={[0.07, 1.1, 0.07]} />
                <meshStandardMaterial color="#22252a" roughness={0.7} metalness={0.5} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 5.95, 0]}>
            <boxGeometry args={[2.0, 0.08, 0.3]} />
            <meshStandardMaterial color="#15171b" roughness={0.6} metalness={0.6} />
          </mesh>
        </group>
      ))}
      {/* Headlights: bright top + twin lower (full emissive). The beam
      itself lives at line level (Train) and always shines from the
      leading nose — one spotlight per line, no per-engine cost. */}
      <mesh position={[0, 3.95, LOCO_LEN / 2 + 0.06]}>
        <boxGeometry args={[0.8, 0.4, 0.1]} />
        <meshStandardMaterial color="#fffbe8" emissive="#fff3c0" emissiveIntensity={3} />
      </mesh>
      {[-1.2, 1.2].map((x) => (
        <mesh key={x} position={[x, 2.1, LOCO_LEN / 2 + 0.06]}>
          <boxGeometry args={[0.55, 0.45, 0.1]} />
          <meshStandardMaterial color="#fffbe8" emissive="#fff3c0" emissiveIntensity={3} />
        </mesh>
      ))}
      {/* Tail lamp (faces the coaches; hidden inside the consist) */}
      <mesh position={[0, 2.9, -LOCO_LEN / 2 - 0.06]}>
        <boxGeometry args={[0.5, 0.4, 0.1]} />
        <meshStandardMaterial color="#7a1010" emissive="#c02020" emissiveIntensity={0.8} />
      </mesh>
      <Wheels len={LOCO_LEN} />
      </group>
    </group>
  );
}

function Coach({ lineId, carIndex, worldRef }: { lineId: string; carIndex: number; worldRef: RefObject<GameWorld> }) {
  // Blue ICF-style general coach (coach numbers vary per position). Never
  // the tail anymore — the rear engine carries the end markers.
  return (
    <IndianRailwayCoach
      last={false}
      lineId={lineId}
      carIndex={carIndex}
      coachNumber={`0820${carIndex}`}
      worldRef={worldRef}
    />
  );
}

export default function Train({ worldRef }: { worldRef: RefObject<GameWorld> }) {
  const carRefs = useRef(new Map<string, THREE.Group | null>());
  // Single warm cabin light that follows the rider's coach: full interior
  // light where the player is, zero cost everywhere else (one light total).
  const cabinLight = useRef<THREE.PointLight>(null!);
  // One headlight beam per line, re-aimed every frame from whichever nose
  // currently leads — push-pull reverses with no extra light cost.
  const beamTargets = useMemo(() => {
    const m = new Map<string, THREE.Object3D>();
    for (const line of LINES) m.set(line.id, new THREE.Object3D());
    return m;
  }, []);
  const beamRefs = useRef(new Map<string, THREE.SpotLight | null>());

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const world = worldRef.current;
    // Keep trains running live while the fullscreen map is open (mapOpen
    // pauses the player/bike sim, but the railway is real-time data).
    // Only the ESC pause menu fully freezes the consists.
    if (world.paused && !world.mapOpen) return;
    updateTrains(world, dt);
    for (const t of world.trains) {
      const cars = trainCarCenters(t.line, t.s, t.dir);
      for (let i = 0; i < cars.length; i++) {
        const g = carRefs.current.get(`${t.line}:${i}`);
        if (!g) continue;
        const c = cars[i];
        g.position.set(c.x, c.y, c.z);
        g.rotation.set(0, c.yaw, 0);
      }
      // Lead beam: nose of the leading engine + 40 m down the track.
      const spot = beamRefs.current.get(t.line);
      const tgt = beamTargets.get(t.line);
      if (spot && tgt) {
        const C = consistLength(getLine(t.line).def.coachCount);
        const lead = trackPointAt(t.line, t.s + t.dir * (C / 2));
        const ly = trackDeckAt(t.line, t.s + t.dir * (C / 2));
        spot.position.set(lead.x, ly + 3.2, lead.z);
        const fx = Math.sin(lead.yaw) * t.dir;
        const fz = Math.cos(lead.yaw) * t.dir;
        tgt.position.set(lead.x + fx * 40, ly + 1.2, lead.z + fz * 40);
      }
    }
    const cab = coachInteriorAt(world.playerPos.x, world.playerPos.z);
    if (cabinLight.current) {
      if (cab) {
        cabinLight.current.position.set(cab.x, cab.y, cab.z);
        cabinLight.current.intensity = 28;
      } else {
        cabinLight.current.intensity = 0;
      }
    }
  });

  return (
    <group>
      <pointLight ref={cabinLight} color="#ffe9bd" intensity={0} distance={13} decay={1.8} />
      {/* Push-pull consists: engine + coaches + engine. At termini the
      train only flips travel direction — the rear engine (nose facing
      outward) simply becomes the leader. One shared headlight beam per
      line always shines from the leading nose. */}
      {LINES.map((line) => (
        <group key={`beam:${line.id}`}>
          <spotLight
            ref={(s) => {
              beamRefs.current.set(line.id, s);
            }}
            position={[0, -100, 0]}
            angle={0.28}
            penumbra={0.55}
            distance={75}
            intensity={450}
            color="#fff2c0"
            target={beamTargets.get(line.id)}
          />
          <primitive object={beamTargets.get(line.id)!} position={[0, 0, 0]} />
        </group>
      ))}
      {LINES.map((line) =>
        Array.from({ length: line.coachCount + 2 }).map((_, i) => (
          <group
            key={`${line.id}:${i}`}
            ref={(g) => {
              carRefs.current.set(`${line.id}:${i}`, g);
            }}
          >
            {i === 0 ? (
              <Loco />
            ) : i === line.coachCount + 1 ? (
              <Loco flip />
            ) : (
              <Coach lineId={line.id} carIndex={i} worldRef={worldRef} />
            )}
          </group>
        )),
      )}
    </group>
  );
}
