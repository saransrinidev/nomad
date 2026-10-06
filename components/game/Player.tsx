// Low-poly humanoid built from Three.js primitives (temporary art until
// real assets exist). Walk/run limb animation is procedural. When riding,
// the character snaps to the bike saddle in a seated pose.

"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { updateOnFoot } from "@/lib/game/playerController";
import { bikeLeanAngle } from "@/lib/game/bikeController";
import type { GameWorld } from "@/lib/game/state";

const SKIN = "#e8b98a";
const JACKET = "#2f6f8f";
const PANTS = "#334155";
const SHOE = "#1f2937";

export default function Player({ worldRef }: { worldRef: RefObject<GameWorld> }) {
  const root = useRef<THREE.Group>(null!);
  const lean = useRef<THREE.Group>(null!);
  const leftLeg = useRef<THREE.Group>(null!);
  const rightLeg = useRef<THREE.Group>(null!);
  const leftArm = useRef<THREE.Group>(null!);
  const rightArm = useRef<THREE.Group>(null!);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const world = worldRef.current;

    // Gentle forward tuck when riding (or sprinting on foot).
    const leanTarget =
      world.mode === "ride" ? 0.14 : world.playerRunning ? 0.1 : 0;
    lean.current.rotation.x +=
      (leanTarget - lean.current.rotation.x) * Math.min(1, dt * 8);

    // Roll with the bike: rider and machine lean equally into turns.
    const rollTarget = world.mode === "ride" ? bikeLeanAngle(world) : 0;
    lean.current.rotation.z +=
      (rollTarget - lean.current.rotation.z) * Math.min(1, dt * 8);

    if (world.mode === "walk") {
      updateOnFoot(world, dt);
      root.current.position.copy(world.playerPos);
      root.current.rotation.set(0, world.playerYaw, 0);

      // Procedural walk cycle.
      const swing = world.playerMoving
        ? Math.sin(world.walkPhase) * (world.playerRunning ? 0.75 : 0.55)
        : 0;
      leftLeg.current.rotation.x = swing;
      rightLeg.current.rotation.x = -swing;
      leftLeg.current.rotation.z = 0;
      rightLeg.current.rotation.z = 0;
      leftArm.current.rotation.x = -swing * 0.85;
      rightArm.current.rotation.x = swing * 0.85;
      // Idle breathing.
      const t = performance.now() / 1000;
      root.current.position.y =
        world.playerPos.y + (world.playerMoving ? 0 : Math.sin(t * 2) * 0.015);
    } else {
      // Seated riding pose: hips on the saddle, thighs forward and
      // splayed around the tank with feet at the pegs, hands to the bars.
      root.current.position.set(
        world.bikePos.x,
        world.bikePos.y + 0.28,
        world.bikePos.z,
      );
      root.current.rotation.set(0, world.bikeYaw, 0);
      leftLeg.current.rotation.x = -0.72;
      rightLeg.current.rotation.x = -0.72;
      leftLeg.current.rotation.z = -0.16;
      rightLeg.current.rotation.z = 0.16;
      leftArm.current.rotation.x = -0.9;
      rightArm.current.rotation.x = -0.9;
    }
  });

  return (
    <group ref={root}>
      {/* Inner group for the riding/sprint forward lean (yaw stays on root). */}
      <group ref={lean}>
      {/* Legs (pivot at hip) */}
      <group ref={leftLeg} position={[-0.14, 0.78, 0]}>
        <mesh position={[0, -0.32, 0]} castShadow>
          <boxGeometry args={[0.22, 0.64, 0.24]} />
          <meshStandardMaterial color={PANTS} roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.68, 0.04]} castShadow>
          <boxGeometry args={[0.23, 0.14, 0.34]} />
          <meshStandardMaterial color={SHOE} roughness={0.9} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.14, 0.78, 0]}>
        <mesh position={[0, -0.32, 0]} castShadow>
          <boxGeometry args={[0.22, 0.64, 0.24]} />
          <meshStandardMaterial color={PANTS} roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.68, 0.04]} castShadow>
          <boxGeometry args={[0.23, 0.14, 0.34]} />
          <meshStandardMaterial color={SHOE} roughness={0.9} />
        </mesh>
      </group>
      {/* Torso */}
      <mesh position={[0, 1.12, 0]} castShadow>
        <boxGeometry args={[0.56, 0.68, 0.32]} />
        <meshStandardMaterial color={JACKET} roughness={0.85} />
      </mesh>
      {/* Arms (pivot at shoulder) */}
      <group ref={leftArm} position={[-0.37, 1.4, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <boxGeometry args={[0.17, 0.58, 0.19]} />
          <meshStandardMaterial color={JACKET} roughness={0.85} />
        </mesh>
        <mesh position={[0, -0.6, 0]} castShadow>
          <sphereGeometry args={[0.09, 8, 8]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.37, 1.4, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <boxGeometry args={[0.17, 0.58, 0.19]} />
          <meshStandardMaterial color={JACKET} roughness={0.85} />
        </mesh>
        <mesh position={[0, -0.6, 0]} castShadow>
          <sphereGeometry args={[0.09, 8, 8]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} />
        </mesh>
      </group>
      {/* Head + cap */}
      <mesh position={[0, 1.72, 0]} castShadow>
        <boxGeometry args={[0.34, 0.36, 0.32]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.93, 0.02]} castShadow>
        <boxGeometry args={[0.38, 0.1, 0.36]} />
        <meshStandardMaterial color="#b3382e" roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.9, 0.28]}>
        <boxGeometry args={[0.3, 0.05, 0.18]} />
        <meshStandardMaterial color="#b3382e" roughness={0.85} />
      </mesh>
      </group>
    </group>
  );
}
