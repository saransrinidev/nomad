// Motorcycle — controller + lights wrapper around the reusable BikeModel.
// Owns the shared GameWorld bike simulation (updateBike), wheel spin,
// steering yaw, park lean, side-stand swing, and head/tail/brake lighting.
// Visual meshes live in BikeModel.tsx (no game logic there).

"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import BikeModel from "./BikeModel";
import { bikeLeanAngle, updateBike } from "@/lib/game/bikeController";
import { updateEngine } from "@/lib/game/audio";
import { nightFactor } from "@/lib/game/map/time";
import { BIKE_PARK_LEAN } from "@/lib/game/gameConstants";
import type { GameWorld } from "@/lib/game/state";

const OLIVE = "#5a6234";

function makeBrakeGlowTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,70,50,0.95)");
  g.addColorStop(0.4, "rgba(255,40,30,0.5)");
  g.addColorStop(1, "rgba(255,30,20,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export default function Motorcycle({ worldRef }: { worldRef: RefObject<GameWorld> }) {
  const root = useRef<THREE.Group>(null!);
  const lean = useRef<THREE.Group>(null!);
  const frontWheel = useRef<THREE.Group>(null!);
  const rearWheel = useRef<THREE.Group>(null!);
  const steering = useRef<THREE.Group>(null!);
  const stand = useRef<THREE.Group>(null!);
  const beam = useRef<THREE.SpotLight>(null!);
  const beamTarget = useMemo(() => new THREE.Object3D(), []);
  const headMat = useRef<THREE.MeshStandardMaterial>(null!);
  const tailMat = useRef<THREE.MeshStandardMaterial>(null!);
  const brakeGlow = useRef<THREE.Sprite>(null!);
  const brakeTex = useMemo(() => makeBrakeGlowTexture(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const world = worldRef.current;
    if (world.paused) {
      updateEngine(0, false, dt);
      return;
    }
    if (world.mode === "ride") updateBike(world, dt);
    updateEngine(world.bikeSpeed, world.engineOn, dt);

    root.current.position.copy(world.bikePos);
    root.current.rotation.set(0, world.bikeYaw, 0);

    // Wheel spin follows distance travelled (radius ~0.35 in controller).
    if (frontWheel.current) frontWheel.current.rotation.x = world.wheelSpin;
    if (rearWheel.current) rearWheel.current.rotation.x = world.wheelSpin;

    const parked = world.mode === "walk";
    if (parked) {
      worldRef.current.bikeSteer += (0 - world.bikeSteer) * Math.min(1, dt * 6);
    }
    const targetLean = parked ? BIKE_PARK_LEAN : bikeLeanAngle(world);
    lean.current.rotation.z += (targetLean - lean.current.rotation.z) * Math.min(1, dt * 8);

    if (stand.current) {
      const standTarget = parked ? 0 : -1.1;
      stand.current.rotation.x += (standTarget - stand.current.rotation.x) * Math.min(1, dt * 7);
    }

    // Steer the whole front assembly (forks + wheel + bars + lamp).
    if (steering.current) steering.current.rotation.y = world.bikeSteer * 0.32;

    const power = world.engineOn && world.lightsOn;
    const braking =
      (world.keys.brake || (world.keys.back && world.bikeSpeed > 0.5)) &&
      world.engineOn;
    if (headMat.current) headMat.current.emissiveIntensity = power ? 1.6 : 0.08;
    if (tailMat.current) tailMat.current.emissiveIntensity = braking ? 3.2 : power ? 0.8 : 0.05;
    if (beam.current) beam.current.intensity = nightFactor(world.time) * (power ? 90 : 0);
    if (brakeGlow.current) {
      (brakeGlow.current.material as THREE.SpriteMaterial).opacity = braking ? 0.85 : 0;
    }
  });

  return (
    <group ref={root}>
      <group ref={lean}>
        <BikeModel
          bodyColor={OLIVE}
          frontWheelRef={frontWheel}
          rearWheelRef={rearWheel}
          steeringRef={steering}
          headlightMatRef={headMat}
          taillightMatRef={tailMat}
          standRef={stand}
        />
        {/* Headlight beam (visible at night) — light only, not geometry */}
        <spotLight
          ref={beam}
          position={[0, 0.9, 1.0]}
          angle={0.55}
          penumbra={0.6}
          distance={45}
          decay={1.6}
          color="#ffeebb"
          intensity={0}
          target={beamTarget}
        />
        <primitive object={beamTarget} position={[0, 0.2, 10]} />
        {/* Brake-light halo */}
        {brakeTex && (
          <sprite ref={brakeGlow} position={[0, 0.8, -1.36]} scale={[0.9, 0.9, 1]}>
            <spriteMaterial
              map={brakeTex}
              color="#ff2a20"
              transparent
              opacity={0}
              depthWrite={false}
            />
          </sprite>
        )}
      </group>
    </group>
  );
}
