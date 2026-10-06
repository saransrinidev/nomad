// Stylized low-poly motorcycle from Three.js primitives: two wheels,
// chassis, handlebar, saddle, bodywork, and a headlight. Wheels spin with
// speed; the body leans into steering. Driven by updateBike() each frame.

"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { bikeLeanAngle, updateBike } from "@/lib/game/bikeController";
import { updateEngine } from "@/lib/game/audio";
import { nightFactor } from "@/lib/game/map/time";
import { BIKE_PARK_LEAN } from "@/lib/game/gameConstants";
import type { GameWorld } from "@/lib/game/state";

const PAINT = "#c23b2e";
const DARK = "#1c1f24";
const METAL = "#9aa3ad";
const SEAT = "#2b2f36";

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
  const handlebar = useRef<THREE.Group>(null!);
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
      // Fade the engine out while paused, freeze everything else.
      updateEngine(0, false, dt);
      return;
    }
    if (world.mode === "ride") updateBike(world, dt);
    // Engine audio follows the ignition state, not the seat: it idles on
    // after dismount when left running, and dies with the kill switch.
    updateEngine(world.bikeSpeed, world.engineOn, dt);

    root.current.position.copy(world.bikePos);
    root.current.rotation.set(0, world.bikeYaw, 0);

    // Wheel spin follows distance travelled.
    frontWheel.current.rotation.x = world.wheelSpin;
    rearWheel.current.rotation.x = world.wheelSpin;

    // Parked: settle onto the side stand and straighten the bars.
    // Riding: lean into turns from the shared lean helper.
    const parked = world.mode === "walk";
    if (parked) {
      worldRef.current.bikeSteer += (0 - world.bikeSteer) * Math.min(1, dt * 6);
    }
    const targetLean = parked ? BIKE_PARK_LEAN : bikeLeanAngle(world);
    lean.current.rotation.z += (targetLean - lean.current.rotation.z) * Math.min(1, dt * 8);

    // Side stand swings down when parked, tucks away when riding.
    const standTarget = parked ? 0 : -1.1;
    stand.current.rotation.x += (standTarget - stand.current.rotation.x) * Math.min(1, dt * 7);

    // Handlebar yaws slightly with steering input.
    handlebar.current.rotation.y = world.bikeSteer * 0.28;

    // Lights need power: everything is dead with the engine off.
    // Taillight glows dim with lights on, flares bright under braking.
    const power = world.engineOn && world.lightsOn;
    const braking =
      (world.keys.brake || (world.keys.back && world.bikeSpeed > 0.5)) &&
      world.engineOn;
    headMat.current.emissiveIntensity = power ? 1.4 : 0.08;
    tailMat.current.emissiveIntensity = braking ? 3.2 : power ? 0.8 : 0.05;
    beam.current.intensity = nightFactor(world.time) * (power ? 90 : 0);
    if (brakeGlow.current) {
      (brakeGlow.current.material as THREE.SpriteMaterial).opacity = braking
        ? 0.85
        : 0;
    }
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
            ref={headMat}
            color="#fff6c9"
            emissive="#ffedb0"
            emissiveIntensity={1.4}
          />
        </mesh>
        {/* Headlight beam (visible at night) */}
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
        {/* Taillight */}
        <mesh position={[0, 0.78, -1.26]}>
          <boxGeometry args={[0.16, 0.08, 0.05]} />
          <meshStandardMaterial
            ref={tailMat}
            color="#ff3b30"
            emissive="#ff3b30"
            emissiveIntensity={1.2}
          />
        </mesh>
        {/* Brake-light halo behind the bike */}
        {brakeTex && (
          <sprite ref={brakeGlow} position={[0, 0.78, -1.36]} scale={[0.9, 0.9, 1]}>
            <spriteMaterial
              map={brakeTex}
              color="#ff2a20"
              transparent
              opacity={0}
              depthWrite={false}
            />
          </sprite>
        )}

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
      {/* Side stand: child of the un-leaned root so the foot stays planted
          while the body settles onto it. Swings down when parked. */}
      <group ref={stand} position={[0.22, 0.32, -0.3]}>
        <mesh position={[0, -0.15, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.045, 0.36, 8]} />
          <meshStandardMaterial color={DARK} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.32, 0.02]}>
          <boxGeometry args={[0.1, 0.05, 0.16]} />
          <meshStandardMaterial color={DARK} roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
}
