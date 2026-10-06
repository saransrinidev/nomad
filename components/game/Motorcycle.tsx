// Stylized low-poly motorcycle from Three.js primitives: two wheels,
// chassis, handlebar, saddle, bodywork, and a headlight. Wheels spin with
// speed; the body leans into steering. Driven by updateBike() each frame.

"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { bikeLeanAngle, updateBike } from "@/lib/game/bikeController";
import { updateEngine } from "@/lib/game/audio";
import type { GameWorld } from "@/lib/game/state";

const PAINT = "#c23b2e";
const DARK = "#1c1f24";
const METAL = "#9aa3ad";
const SEAT = "#2b2f36";

export default function Motorcycle({ worldRef }: { worldRef: RefObject<GameWorld> }) {
  const root = useRef<THREE.Group>(null!);
  const lean = useRef<THREE.Group>(null!);
  const frontWheel = useRef<THREE.Group>(null!);
  const rearWheel = useRef<THREE.Group>(null!);
  const handlebar = useRef<THREE.Group>(null!);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const world = worldRef.current;
    if (world.mode === "ride") updateBike(world, dt);
    // Engine audio follows every frame (ignition on mount, fade on exit).
    updateEngine(world.bikeSpeed, world.mode === "ride", dt);

    root.current.position.copy(world.bikePos);
    root.current.rotation.set(0, world.bikeYaw, 0);

    // Wheel spin follows distance travelled.
    frontWheel.current.rotation.x = world.wheelSpin;
    rearWheel.current.rotation.x = world.wheelSpin;

    // Lean into turns, scaled by speed (max ~20 degrees).
    const targetLean = bikeLeanAngle(world);
    lean.current.rotation.z += (targetLean - lean.current.rotation.z) * Math.min(1, dt * 8);

    // Handlebar yaws slightly with steering input.
    handlebar.current.rotation.y = world.bikeSteer * 0.28;
  });

  return (
    <group ref={root}>
      <group ref={lean}>
        {/* Wheels */}
        <group ref={frontWheel} position={[0, 0.38, 1.0]}>
          <mesh rotation-y={Math.PI / 2} castShadow>
            <torusGeometry args={[0.3, 0.13, 10, 20]} />
            <meshStandardMaterial color={DARK} roughness={0.9} />
          </mesh>
          <mesh rotation-z={Math.PI / 2} castShadow>
            <cylinderGeometry args={[0.09, 0.09, 0.12, 10]} />
            <meshStandardMaterial color={METAL} roughness={0.4} metalness={0.6} />
          </mesh>
        </group>
        <group ref={rearWheel} position={[0, 0.38, -0.95]}>
          <mesh rotation-y={Math.PI / 2} castShadow>
            <torusGeometry args={[0.3, 0.13, 10, 20]} />
            <meshStandardMaterial color={DARK} roughness={0.9} />
          </mesh>
          <mesh rotation-z={Math.PI / 2} castShadow>
            <cylinderGeometry args={[0.09, 0.09, 0.12, 10]} />
            <meshStandardMaterial color={METAL} roughness={0.4} metalness={0.6} />
          </mesh>
        </group>

        {/* Chassis / engine block */}
        <mesh position={[0, 0.55, 0]} castShadow>
          <boxGeometry args={[0.36, 0.34, 1.1]} />
          <meshStandardMaterial color={DARK} roughness={0.8} />
        </mesh>
        {/* Fuel tank + painted body (meets the saddle) */}
        <mesh position={[0, 0.82, 0.33]} castShadow>
          <boxGeometry args={[0.4, 0.28, 0.56]} />
          <meshStandardMaterial color={PAINT} roughness={0.5} />
        </mesh>
        {/* Front fairing */}
        <mesh position={[0, 0.78, 0.85]} rotation-x={0.25} castShadow>
          <boxGeometry args={[0.34, 0.42, 0.3]} />
          <meshStandardMaterial color={PAINT} roughness={0.5} />
        </mesh>
        {/* Saddle (sits under the rider, ahead of the tail unit) */}
        <mesh position={[0, 0.86, -0.275]} castShadow>
          <boxGeometry args={[0.42, 0.14, 0.65]} />
          <meshStandardMaterial color={SEAT} roughness={0.95} />
        </mesh>
        {/* Rear body */}
        <mesh position={[0, 0.72, -1.05]} castShadow>
          <boxGeometry args={[0.36, 0.22, 0.4]} />
          <meshStandardMaterial color={PAINT} roughness={0.5} />
        </mesh>
        {/* Exhaust pipe */}
        <mesh position={[0.26, 0.42, -0.5]} rotation-x={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.07, 0.09, 1.0, 10]} />
          <meshStandardMaterial color={METAL} roughness={0.35} metalness={0.7} />
        </mesh>
        {/* Foot pegs under the rider's feet, with mounting brackets */}
        {[-0.28, 0.28].map((x) => (
          <group key={x}>
            <mesh position={[x, 0.36, 0.08]} castShadow>
              <boxGeometry args={[0.16, 0.06, 0.22]} />
              <meshStandardMaterial color={DARK} roughness={0.8} />
            </mesh>
            <mesh position={[x, 0.42, 0.08]}>
              <boxGeometry args={[0.05, 0.16, 0.05]} />
              <meshStandardMaterial color={DARK} roughness={0.8} />
            </mesh>
          </group>
        ))}
        {/* Front forks */}
        {[-0.14, 0.14].map((x) => (
          <mesh key={x} position={[x, 0.62, 0.92]} rotation-x={-0.18} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.75, 8]} />
            <meshStandardMaterial color={METAL} roughness={0.35} metalness={0.7} />
          </mesh>
        ))}
        {/* Headlight */}
        <mesh position={[0, 0.86, 1.02]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshStandardMaterial
            color="#fff6c9"
            emissive="#ffedb0"
            emissiveIntensity={1.4}
          />
        </mesh>
        {/* Taillight */}
        <mesh position={[0, 0.78, -1.26]}>
          <boxGeometry args={[0.16, 0.08, 0.05]} />
          <meshStandardMaterial
            color="#ff3b30"
            emissive="#ff3b30"
            emissiveIntensity={1.2}
          />
        </mesh>

        {/* Handlebar (steers visually) — pulled back over the tank so the
            upright rider's hands rest on the grips */}
        <group ref={handlebar} position={[0, 1.12, 0.22]}>
          <mesh rotation-z={Math.PI / 2} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 0.72, 8]} />
            <meshStandardMaterial color={DARK} roughness={0.7} />
          </mesh>
          {[-0.36, 0.36].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation-z={Math.PI / 2}>
              <cylinderGeometry args={[0.055, 0.055, 0.14, 8]} />
              <meshStandardMaterial color={SEAT} roughness={0.95} />
            </mesh>
          ))}
        </group>
        {/* Handlebar risers connecting the bar down toward the fork crown */}
        {[-0.12, 0.12].map((x) => (
          <mesh key={x} position={[x, 0.98, 0.34]} rotation-x={0.45} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.36, 8]} />
            <meshStandardMaterial color={METAL} roughness={0.35} metalness={0.7} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
