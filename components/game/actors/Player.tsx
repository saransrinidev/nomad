// Low-poly humanoid built from Three.js primitives (temporary art until
// real assets exist). Walk/run limb animation is procedural. When riding,
// the character snaps to the bike saddle in a seated pose.

"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { updateOnFoot } from "@/lib/game/playerController";
import { bikeLeanAngle } from "@/lib/game/bikeController";
import { berthAnchor, getLiveCars, seatAnchor } from "@/lib/game/map/railway";
import { playFootstep } from "@/lib/game/audio";
import type { GameWorld } from "@/lib/game/state";

const SKIN = "#e8b98a";
const SHIRT = "#161616";
const DENIM = "#2f4d7d";
const SHOE = "#1f2937";
const HAIR = "#14100d";

export default function Player({ worldRef }: { worldRef: RefObject<GameWorld> }) {
  const root = useRef<THREE.Group>(null!);
  const lean = useRef<THREE.Group>(null!);
  const leftLeg = useRef<THREE.Group>(null!);
  const rightLeg = useRef<THREE.Group>(null!);
  const leftArm = useRef<THREE.Group>(null!);
  const rightArm = useRef<THREE.Group>(null!);
  const leftElbow = useRef<THREE.Group>(null!);
  const rightElbow = useRef<THREE.Group>(null!);
  const lastStep = useRef(-1);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const world = worldRef.current;
    if (world.paused) return;

    // Torso stays upright; only the arms reach out (sprint adds a slight tuck).
    const leanTarget = world.mode === "ride" ? 0 : world.playerRunning ? 0.1 : 0;
    lean.current.rotation.x +=
      (leanTarget - lean.current.rotation.x) * Math.min(1, dt * 8);

    // Roll with the bike: rider and machine lean equally into turns.
    const rollTarget = world.mode === "ride" ? bikeLeanAngle(world) : 0;
    lean.current.rotation.z +=
      (rollTarget - lean.current.rotation.z) * Math.min(1, dt * 8);

    if (world.mode === "train") {
      // Riding inside a coach: root pinned to the seat/berth anchor, which
      // tracks the moving consist every frame (Train ticks before Player).
      const seat = world.trainSeat;
      const cars = seat ? getLiveCars(seat.line) : [];
      const car = seat ? cars[seat.car] : undefined;
      if (seat && car) {
        const gy = car.y;
        const tr = world.trains.find((t) => t.line === seat.line);
        const tdir = tr ? tr.dir : 1;
        if (!seat.lying) {
          const a = seatAnchor(seat.line, seat.car, seat.side, tdir);
          if (a) {
            root.current.position.set(a.x, gy + a.y - 0.72, a.z);
            root.current.rotation.set(0, a.yaw, 0);
            // Mirror into world state so the camera, maps, and prompts
            // travel with the rider (Train ticks before Player).
            world.playerPos.set(a.x, gy + a.y - 0.72, a.z);
            world.playerYaw = a.yaw;
          }
          lean.current.rotation.x = 0;
          // Seated: thighs forward, hands resting on lap.
          leftLeg.current.rotation.x = -1.35;
          rightLeg.current.rotation.x = -1.35;
          leftLeg.current.rotation.z = -0.08;
          rightLeg.current.rotation.z = 0.08;
          leftArm.current.rotation.x = -0.35;
          rightArm.current.rotation.x = -0.35;
          leftElbow.current.rotation.x = -0.6;
          rightElbow.current.rotation.x = -0.6;
        } else {
          const a = berthAnchor(seat.line, seat.car, tdir);
          if (a) {
            root.current.position.set(a.x, gy + a.y, a.z);
            root.current.rotation.set(0, a.yaw, 0);
            world.playerPos.set(a.x, gy + a.y, a.z);
            world.playerYaw = a.yaw;
          }
          // Lying: whole body pitched flat, limbs relaxed straight.
          lean.current.rotation.x = -Math.PI / 2 + 0.12;
          leftLeg.current.rotation.x = -0.08;
          rightLeg.current.rotation.x = -0.08;
          leftLeg.current.rotation.z = 0;
          rightLeg.current.rotation.z = 0;
          leftArm.current.rotation.x = -0.15;
          rightArm.current.rotation.x = -0.15;
          leftElbow.current.rotation.x = -0.2;
          rightElbow.current.rotation.x = -0.2;
        }
      }
      world.playerSpeed = 0;
      world.playerMoving = false;
      world.playerVelY = 0;
      return;
    }

    if (world.mode === "walk") {
      updateOnFoot(world, dt);
      root.current.position.copy(world.playerPos);
      root.current.rotation.set(0, world.playerYaw, 0);

      // Footstep on each half walk-cycle.
      const stepIndex = Math.floor(world.walkPhase / Math.PI);
      if (world.playerMoving && stepIndex !== lastStep.current) {
        lastStep.current = stepIndex;
        playFootstep(world.playerRunning);
      } else if (!world.playerMoving) {
        lastStep.current = stepIndex;
      }

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
      // Slight natural elbow bend while walking.
      leftElbow.current.rotation.x = -0.25;
      rightElbow.current.rotation.x = -0.25;
      // Idle breathing.
      const t = performance.now() / 1000;
      root.current.position.y =
        world.playerPos.y + (world.playerMoving ? 0 : Math.sin(t * 2) * 0.015);
    } else {
      // Seated riding pose: hips on the saddle (offset behind bike center),
      // thighs forward with feet at the pegs, hands to the bars. Torso stays
      // upright — only the arms reach out.
      const fx = Math.sin(world.bikeYaw);
      const fz = Math.cos(world.bikeYaw);
      root.current.position.set(
        world.bikePos.x - fx * 0.3,
        world.bikePos.y + 0.18,
        world.bikePos.z - fz * 0.3,
      );
      root.current.rotation.set(0, world.bikeYaw, 0);
      leftLeg.current.rotation.x = -0.55;
      rightLeg.current.rotation.x = -0.55;
      leftLeg.current.rotation.z = -0.16;
      rightLeg.current.rotation.z = 0.16;
      // Arms reach forward-down so the hands land on the handlebar grips.
      leftArm.current.rotation.x = -0.68;
      rightArm.current.rotation.x = -0.68;
      leftElbow.current.rotation.x = -0.12;
      rightElbow.current.rotation.x = -0.12;
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
          <meshStandardMaterial color={DENIM} roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.68, 0.04]} castShadow>
          <boxGeometry args={[0.23, 0.14, 0.34]} />
          <meshStandardMaterial color={SHOE} roughness={0.9} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.14, 0.78, 0]}>
        <mesh position={[0, -0.32, 0]} castShadow>
          <boxGeometry args={[0.22, 0.64, 0.24]} />
          <meshStandardMaterial color={DENIM} roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.68, 0.04]} castShadow>
          <boxGeometry args={[0.23, 0.14, 0.34]} />
          <meshStandardMaterial color={SHOE} roughness={0.9} />
        </mesh>
      </group>
      {/* Torso */}
      <mesh position={[0, 1.12, 0]} castShadow>
        <boxGeometry args={[0.56, 0.68, 0.32]} />
        <meshStandardMaterial color={SHIRT} roughness={0.85} />
      </mesh>
      {/* Neck (joins torso to head) */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[0.16, 0.14, 0.16]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} />
      </mesh>
      {/* Arms: upper arm pivots at shoulder, forearm at elbow */}
      <group ref={leftArm} position={[-0.37, 1.4, 0]}>
        <mesh position={[0, -0.17, 0]} castShadow>
          <boxGeometry args={[0.17, 0.34, 0.19]} />
          <meshStandardMaterial color={SHIRT} roughness={0.85} />
        </mesh>
        <group ref={leftElbow} position={[0, -0.34, 0]}>
          <mesh position={[0, -0.16, 0]} castShadow>
            <boxGeometry args={[0.15, 0.32, 0.17]} />
            <meshStandardMaterial color={SHIRT} roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.36, 0]} castShadow>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshStandardMaterial color={SKIN} roughness={0.8} />
          </mesh>
        </group>
      </group>
      <group ref={rightArm} position={[0.37, 1.4, 0]}>
        <mesh position={[0, -0.17, 0]} castShadow>
          <boxGeometry args={[0.17, 0.34, 0.19]} />
          <meshStandardMaterial color={SHIRT} roughness={0.85} />
        </mesh>
        <group ref={rightElbow} position={[0, -0.34, 0]}>
          <mesh position={[0, -0.16, 0]} castShadow>
            <boxGeometry args={[0.15, 0.32, 0.17]} />
            <meshStandardMaterial color={SHIRT} roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.36, 0]} castShadow>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshStandardMaterial color={SKIN} roughness={0.8} />
          </mesh>
        </group>
      </group>
      {/* Head */}
      <mesh position={[0, 1.72, 0]} castShadow>
        <boxGeometry args={[0.34, 0.36, 0.32]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} />
      </mesh>
      {/* Black hair: top cover + back panel */}
      <mesh position={[0, 1.93, -0.01]} castShadow>
        <boxGeometry args={[0.37, 0.12, 0.35]} />
        <meshStandardMaterial color={HAIR} roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.78, -0.16]} castShadow>
        <boxGeometry args={[0.37, 0.3, 0.07]} />
        <meshStandardMaterial color={HAIR} roughness={0.95} />
      </mesh>
      {/* Eyes on the +Z face */}
      {[-0.09, 0.09].map((x) => (
        <group key={x} position={[x, 1.74, 0]}>
          <mesh position={[0, 0, 0.163]}>
            <boxGeometry args={[0.09, 0.11, 0.02]} />
            <meshStandardMaterial color="#ffffff" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0.176]}>
            <boxGeometry args={[0.045, 0.06, 0.012]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.4} />
          </mesh>
        </group>
      ))}
      </group>
    </group>
  );
}
