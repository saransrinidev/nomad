// BikeModel — reusable retro-roadster visual (350cc classic inspiration).
// Pure presentational geometry: no useFrame, no game state, no audio.
// Animation is driven by the parent (Motorcycle.tsx) through refs so the
// 60fps loop never triggers React re-renders.
//
// Anchors preserved from the original placeholder so rider/physics align:
//   front axle (0, 0.35, 1.0) | rear axle (0, 0.35, -0.95)
//   seat top ~0.92 @ z -0.27 | pegs (±0.28, 0.36, 0.08)
//   grips (±0.36, 1.12, 0.22)
//
// Performance: shared geometries/materials via useMemo, InstancedMesh for
// tread blocks + spokes (4 draw calls instead of ~80), castShadow only on
// major masses, a single CanvasTexture for NOMAD branding.

"use client";

import { useLayoutEffect, useMemo, useRef, type Ref } from "react";
import * as THREE from "three";

export interface BikeModelProps {
  bodyColor?: string;
  frontWheelRef?: Ref<THREE.Group>;
  rearWheelRef?: Ref<THREE.Group>;
  /** Yaw group for the whole front assembly (forks + wheel + bars + lamp). */
  steeringRef?: Ref<THREE.Group>;
  headlightMatRef?: Ref<THREE.MeshStandardMaterial>;
  taillightMatRef?: Ref<THREE.MeshStandardMaterial>;
  standRef?: Ref<THREE.Group>;
}

const OLIVE = "#5a6234";
const TREAD_COUNT = 26;
const SPOKE_COUNT = 18;
const TIRE_OUTER = 0.35;
const RIM_R = 0.20;

function makeNomadTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = "#f2ecd8";
  ctx.font = "700 72px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("NOMAD", 256, 52);
  ctx.fillRect(120, 92, 272, 5);
  ctx.font = "600 26px Arial, sans-serif";
  ctx.fillText("3 5 0", 256, 110);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeLeatherBump(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const s = 128;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) {
    const g = 110 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

/** One wheel: tire + instanced tread + rim + instanced spokes + brake disc. */
function Wheel({
  spinRef,
  mats,
  geos,
}: {
  spinRef?: Ref<THREE.Group>;
  mats: Record<string, THREE.MeshStandardMaterial>;
  geos: { tread: THREE.BoxGeometry; spoke: THREE.CylinderGeometry };
}) {
  const treadRef = useRef<THREE.InstancedMesh>(null!);
  const spokeRef = useRef<THREE.InstancedMesh>(null!);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const t = treadRef.current;
    if (t) {
      for (let i = 0; i < TREAD_COUNT; i++) {
        const a = (i / TREAD_COUNT) * Math.PI * 2;
        // Alternate slight lateral offset for a chevron look.
        const x = (i % 2 === 0 ? 0.045 : -0.045);
        dummy.position.set(x, Math.cos(a) * TIRE_OUTER, Math.sin(a) * TIRE_OUTER);
        dummy.rotation.set(a, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        t.setMatrixAt(i, dummy.matrix);
      }
      t.instanceMatrix.needsUpdate = true;
    }
    const s = spokeRef.current;
    if (s) {
      for (let i = 0; i < SPOKE_COUNT; i++) {
        const a = (i / SPOKE_COUNT) * Math.PI * 2;
        const r = RIM_R / 2;
        dummy.position.set((i % 2 === 0 ? 0.018 : -0.018), Math.cos(a) * r, Math.sin(a) * r);
        dummy.rotation.set(a, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        s.setMatrixAt(i, dummy.matrix);
      }
      s.instanceMatrix.needsUpdate = true;
    }
  }, []);

  return (
    <group ref={spinRef}>
      {/* Tire carcass */}
      <mesh rotation-y={Math.PI / 2} castShadow material={mats.rubber}>
        <torusGeometry args={[0.26, 0.09, 14, 32]} />
      </mesh>
      {/* Tread blocks (instanced, 1 draw call) */}
      <instancedMesh
        ref={treadRef}
        args={[geos.tread, mats.rubberTread, TREAD_COUNT]}
        frustumCulled={false}
      />
      {/* Rim band + lip */}
      <mesh rotation-y={Math.PI / 2} material={mats.alloy}>
        <torusGeometry args={[RIM_R, 0.028, 10, 28]} />
      </mesh>
      <mesh rotation-z={Math.PI / 2} material={mats.alloyDark}>
        <cylinderGeometry args={[RIM_R, RIM_R, 0.05, 20]} />
      </mesh>
      {/* Spokes (instanced, 1 draw call) */}
      <instancedMesh
        ref={spokeRef}
        args={[geos.spoke, mats.chrome, SPOKE_COUNT]}
        frustumCulled={false}
      />
      {/* Hub + axle + nuts */}
      <mesh rotation-z={Math.PI / 2} material={mats.steelDark}>
        <cylinderGeometry args={[0.035, 0.035, 0.14, 12]} />
      </mesh>
      {[-0.08, 0.08].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation-z={Math.PI / 2} material={mats.steelDark}>
          <cylinderGeometry args={[0.022, 0.022, 0.03, 6]} />
        </mesh>
      ))}
      {/* Brake disc + caliper */}
      <mesh position={[0.055, 0, 0]} rotation-z={Math.PI / 2} material={mats.disc}>
        <cylinderGeometry args={[0.11, 0.11, 0.016, 24]} />
      </mesh>
      <mesh position={[0.055, 0.09, -0.06]} material={mats.calipers}>
        <boxGeometry args={[0.04, 0.09, 0.06]} />
      </mesh>
    </group>
  );
}

export default function BikeModel({
  bodyColor = OLIVE,
  frontWheelRef,
  rearWheelRef,
  steeringRef,
  headlightMatRef,
  taillightMatRef,
  standRef,
}: BikeModelProps) {
  const mats = useMemo(() => {
    const m = {
      paint: new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.45, roughness: 0.32 }),
      chrome: new THREE.MeshStandardMaterial({ color: "#d9dee3", metalness: 1.0, roughness: 0.22 }),
      alloy: new THREE.MeshStandardMaterial({ color: "#b9bec4", metalness: 0.9, roughness: 0.35 }),
      alloyDark: new THREE.MeshStandardMaterial({ color: "#6e747b", metalness: 0.85, roughness: 0.45 }),
      steelDark: new THREE.MeshStandardMaterial({ color: "#33373d", metalness: 0.8, roughness: 0.5 }),
      engine: new THREE.MeshStandardMaterial({ color: "#9aa0a6", metalness: 0.9, roughness: 0.38 }),
      engineDark: new THREE.MeshStandardMaterial({ color: "#4a4e54", metalness: 0.85, roughness: 0.5 }),
      disc: new THREE.MeshStandardMaterial({ color: "#8f959c", metalness: 0.95, roughness: 0.3 }),
      calipers: new THREE.MeshStandardMaterial({ color: "#7a1f1f", metalness: 0.4, roughness: 0.5 }),
      rubber: new THREE.MeshStandardMaterial({ color: "#161616", metalness: 0, roughness: 0.95 }),
      rubberTread: new THREE.MeshStandardMaterial({ color: "#1b1b1b", metalness: 0, roughness: 0.98 }),
      leather: new THREE.MeshStandardMaterial({ color: "#141416", metalness: 0.05, roughness: 0.82 }),
      black: new THREE.MeshStandardMaterial({ color: "#1c1f24", metalness: 0.3, roughness: 0.7 }),
      glass: new THREE.MeshStandardMaterial({ color: "#fff6d8", emissive: "#ffedb0", emissiveIntensity: 1.4, roughness: 0.2 }),
      tail: new THREE.MeshStandardMaterial({ color: "#ff3b30", emissive: "#ff3b30", emissiveIntensity: 0.8, roughness: 0.3 }),
      amber: new THREE.MeshStandardMaterial({ color: "#ff9d0a", emissive: "#ff9d0a", emissiveIntensity: 0.7, roughness: 0.3 }),
      mirror: new THREE.MeshStandardMaterial({ color: "#e8edf2", metalness: 1.0, roughness: 0.06 }),
    };
    const bump = makeLeatherBump();
    if (bump) {
      m.leather.bumpMap = bump;
      m.leather.bumpScale = 0.6;
    }
    return m;
  }, [bodyColor]);

  const geos = useMemo(
    () => ({
      tread: new THREE.BoxGeometry(0.075, 0.022, 0.055),
      spoke: new THREE.CylinderGeometry(0.006, 0.006, RIM_R, 6),
      fin: new THREE.BoxGeometry(0.34, 0.018, 0.3),
    }),
    []
  );

  const nomadTex = useMemo(() => makeNomadTexture(), []);

  const exhaustCurve = useMemo(
    () =>
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(0.1, 0.48, 0.3),
          new THREE.Vector3(0.14, 0.34, 0.45),
          new THREE.Vector3(0.2, 0.26, 0.1),
          new THREE.Vector3(0.24, 0.28, -0.4),
          new THREE.Vector3(0.26, 0.34, -0.85),
        ]),
        24,
        0.045,
        10,
        false
      ),
    []
  );

  return (
    <group>
      {/* ---------- Rear wheel (static part of chassis) ---------- */}
      <group position={[0, 0.35, -0.95]}>
        <Wheel spinRef={rearWheelRef} mats={mats} geos={geos} />
        {/* Rear sprocket + chain run */}
        <mesh position={[-0.07, 0, 0]} rotation-z={Math.PI / 2} material={mats.steelDark}>
          <cylinderGeometry args={[0.09, 0.09, 0.02, 18]} />
        </mesh>
        <mesh position={[-0.07, 0.12, 0.55]} rotation-x={-0.13} material={mats.steelDark}>
          <boxGeometry args={[0.025, 0.04, 1.15]} />
        </mesh>
        {/* Swingarm */}
        {[-0.09, 0.09].map((x) => (
          <mesh key={x} position={[x, 0.05, 0.45]} rotation-x={-0.1} castShadow material={mats.black}>
            <boxGeometry args={[0.05, 0.07, 1.0]} />
          </mesh>
        ))}
        {/* Twin rear shocks with springs */}
        {[-0.13, 0.13].map((x) => (
          <group key={x} position={[x, 0.59, -0.62]} rotation-x={-0.35}>
            <mesh castShadow material={mats.chrome}>
              <cylinderGeometry args={[0.025, 0.025, 0.42, 10]} />
            </mesh>
            {[0.12, 0.05, -0.02, -0.09].map((y, i) => (
              <mesh key={i} position={[0, y, 0]} rotation-x={Math.PI / 2} material={mats.steelDark}>
                <torusGeometry args={[0.042, 0.011, 8, 16]} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Rear mudguard (hugs tire) */}
        <mesh position={[0, 0.08, -0.1]} rotation-x={-0.5} material={mats.paint}>
          <cylinderGeometry args={[0.39, 0.39, 0.22, 16, 1, true, Math.PI * 0.55, Math.PI * 0.5]} />
        </mesh>
      </group>

      {/* ---------- Frame / engine / tank / seat (non-steering) ---------- */}
      {/* Engine crankcase + cooling fins + barrel */}
      <mesh position={[0, 0.42, 0.05]} castShadow material={mats.engineDark}>
        <boxGeometry args={[0.3, 0.26, 0.5]} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[0, 0.52 + i * 0.045, 0.12]} material={mats.engine}>
          <boxGeometry args={[0.34, 0.018, 0.3]} />
        </mesh>
      ))}
      <mesh position={[0, 0.8, 0.12]} castShadow material={mats.engine}>
        <boxGeometry args={[0.26, 0.12, 0.24]} />
      </mesh>
      {/* Round chrome crank covers */}
      {[-0.16, 0.16].map((x) => (
        <mesh key={x} position={[x, 0.42, 0.02]} rotation-z={Math.PI / 2} material={mats.chrome}>
          <cylinderGeometry args={[0.09, 0.09, 0.03, 20]} />
        </mesh>
      ))}
      {/* Frame cradle tubes */}
      {[-0.14, 0.14].map((x) => (
        <mesh key={x} position={[x, 0.62, -0.35]} rotation-x={0.12} material={mats.black}>
          <cylinderGeometry args={[0.028, 0.028, 1.1, 8]} />
        </mesh>
      ))}
      {/* Front downtubes: headstock down to engine front (closes the open gap) */}
      {[-0.095, 0.095].map((x) => (
        <mesh key={x} position={[x, 0.72, 0.49]} rotation-x={0.87} castShadow material={mats.black}>
          <cylinderGeometry args={[0.03, 0.03, 0.55, 8]} />
        </mesh>
      ))}
      {/* Top spine: tank front to headstock */}
      <mesh position={[0, 0.91, 0.6]} rotation-x={1.28} material={mats.black}>
        <cylinderGeometry args={[0.028, 0.028, 0.21, 8]} />
      </mesh>
      {/* Side covers + battery box + air filter */}
      {[-0.17, 0.17].map((x) => (
        <mesh key={x} position={[x, 0.63, -0.4]} castShadow material={mats.paint}>
          <boxGeometry args={[0.04, 0.24, 0.34]} />
        </mesh>
      ))}
      <mesh position={[0, 0.55, -0.36]} material={mats.black}>
        <boxGeometry args={[0.28, 0.2, 0.3]} />
      </mesh>

      {/* Fuel tank (olive) + cap + NOMAD decals */}
      <mesh position={[0, 0.84, 0.3]} scale={[1, 0.72, 1.35]} castShadow material={mats.paint}>
        <sphereGeometry args={[0.21, 24, 18]} />
      </mesh>
      <mesh position={[0, 0.985, 0.28]} material={mats.chrome}>
        <cylinderGeometry args={[0.035, 0.035, 0.025, 16]} />
      </mesh>
      {nomadTex &&
        [-0.201, 0.201].map((x, i) => (
          <mesh key={x} position={[x, 0.84, 0.3]} rotation-y={i === 0 ? -Math.PI / 2 : Math.PI / 2}>
            <planeGeometry args={[0.42, 0.105]} />
            <meshStandardMaterial map={nomadTex} transparent roughness={0.4} metalness={0.1} />
          </mesh>
        ))}

      {/* Leather saddle: rider + pillion, top ~0.91 (capsules laid flat) */}
      <mesh position={[0, 0.83, -0.28]} rotation-x={Math.PI / 2} scale={[1, 1, 0.55]} castShadow material={mats.leather}>
        <capsuleGeometry args={[0.15, 0.42, 6, 14]} />
      </mesh>
      <mesh position={[0, 0.8, -0.78]} rotation-x={Math.PI / 2} scale={[0.9, 1, 0.5]} castShadow material={mats.leather}>
        <capsuleGeometry args={[0.13, 0.2, 6, 12]} />
      </mesh>
      {/* Tail unit + grab rail */}
      <mesh position={[0, 0.78, -1.12]} castShadow material={mats.paint}>
        <boxGeometry args={[0.26, 0.14, 0.3]} />
      </mesh>
      <mesh position={[0, 0.86, -1.05]} rotation-x={0.1} material={mats.chrome}>
        <torusGeometry args={[0.14, 0.016, 8, 20, Math.PI]} />
      </mesh>

      {/* Exhaust header (tube) + muffler */}
      <mesh geometry={exhaustCurve} material={mats.chrome} castShadow />
      <mesh position={[0.27, 0.36, -1.05]} rotation-x={Math.PI / 2} castShadow material={mats.chrome}>
        <cylinderGeometry args={[0.075, 0.09, 0.55, 18]} />
      </mesh>
      <mesh position={[0.27, 0.36, -1.33]} rotation-x={Math.PI / 2} material={mats.black}>
        <cylinderGeometry args={[0.06, 0.075, 0.06, 18]} />
      </mesh>
      {[0.85, 1.15].map((z, i) => (
        <mesh key={i} position={[0.27, 0.36, -z]} rotation-x={Math.PI / 2} material={mats.steelDark}>
          <torusGeometry args={[0.085, 0.012, 8, 18]} />
        </mesh>
      ))}

      {/* Foot pegs at rider anchors + brake / gear levers */}
      {[-0.28, 0.28].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.36, 0.08]} castShadow material={mats.rubber}>
            <boxGeometry args={[0.14, 0.045, 0.1]} />
          </mesh>
          <mesh position={[x * 0.8, 0.42, 0.08]} material={mats.steelDark}>
            <boxGeometry args={[0.04, 0.14, 0.04]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0.3, 0.33, 0.22]} rotation-y={0.2} material={mats.alloyDark}>
        <boxGeometry args={[0.03, 0.03, 0.18]} />
      </mesh>
      <mesh position={[-0.3, 0.33, 0.22]} rotation-y={-0.2} material={mats.alloyDark}>
        <boxGeometry args={[0.03, 0.03, 0.18]} />
      </mesh>

      {/* Taillight + plate + rear indicators */}
      <mesh position={[0, 0.8, -1.28]}>
        <boxGeometry args={[0.14, 0.07, 0.05]} />
        <meshStandardMaterial
          ref={taillightMatRef as Ref<THREE.MeshStandardMaterial>}
          color="#ff3b30"
          emissive="#ff3b30"
          emissiveIntensity={0.8}
        />
      </mesh>
      <mesh position={[0, 0.66, -1.29]} rotation-x={0.15} material={mats.black}>
        <boxGeometry args={[0.16, 0.12, 0.015]} />
      </mesh>
      {[-0.14, 0.14].map((x) => (
        <group key={x} position={[x, 0.8, -1.24]}>
          <mesh rotation-z={Math.PI / 2} material={mats.steelDark}>
            <cylinderGeometry args={[0.012, 0.012, 0.08, 8]} />
          </mesh>
          <mesh position={[x > 0 ? 0.05 : -0.05, 0, 0]} material={mats.amber}>
            <capsuleGeometry args={[0.022, 0.03, 4, 10]} />
          </mesh>
        </group>
      ))}

      {/* ---------- Steering assembly (yaws with input) ---------- */}
      <group ref={steeringRef} position={[0, 0, 0.72]}>
        {/* Front wheel */}
        <group position={[0, 0.35, 0.28]}>
          <Wheel spinRef={frontWheelRef} mats={mats} geos={geos} />
          {/* Front mudguard (hugs tire) */}
          <mesh position={[0, 0.08, -0.02]} rotation-x={0.45} material={mats.paint}>
            <cylinderGeometry args={[0.39, 0.39, 0.2, 16, 1, true, Math.PI * 0.55, Math.PI * 0.5]} />
          </mesh>
        </group>
        {/* Forks: chrome stanchion + dark slider, raked back */}
        {[-0.09, 0.09].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 0.78, 0.12]} rotation-x={0.32} castShadow material={mats.chrome}>
              <cylinderGeometry args={[0.028, 0.028, 0.42, 12]} />
            </mesh>
            <mesh position={[0, 0.47, 0.21]} rotation-x={0.32} castShadow material={mats.alloyDark}>
              <cylinderGeometry args={[0.036, 0.032, 0.52, 12]} />
            </mesh>
            {/* Rubber gaiter */}
            <mesh position={[0, 0.62, 0.165]} rotation-x={0.32} material={mats.rubber}>
              <cylinderGeometry args={[0.042, 0.046, 0.12, 12]} />
            </mesh>
          </group>
        ))}
        {/* Triple clamp + steering stem */}
        <mesh position={[0, 0.96, 0.02]} rotation-x={0.32} material={mats.steelDark}>
          <boxGeometry args={[0.24, 0.05, 0.1]} />
        </mesh>
        {/* Headlight brackets tying the bucket to the forks */}
        {[-0.09, 0.09].map((x) => (
          <mesh key={x} position={[x, 0.92, 0.18]} material={mats.steelDark}>
            <boxGeometry args={[0.03, 0.03, 0.28]} />
          </mesh>
        ))}
        {/* Headlight bucket (chrome) + LED lens + DRL ring */}
        <group position={[0, 0.92, 0.33]}>
          <mesh rotation-x={Math.PI / 2} castShadow material={mats.chrome}>
            <cylinderGeometry args={[0.11, 0.09, 0.14, 20]} />
          </mesh>
          <mesh position={[0, 0, 0.075]} rotation-x={0}>
            <sphereGeometry args={[0.095, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial
              ref={headlightMatRef as Ref<THREE.MeshStandardMaterial>}
              color="#fff6d8"
              emissive="#ffedb0"
              emissiveIntensity={1.4}
              roughness={0.15}
            />
          </mesh>
          <mesh position={[0, 0, 0.078]} material={mats.glass}>
            <torusGeometry args={[0.095, 0.008, 8, 24]} />
          </mesh>
        </group>
        {/* Front indicators on stalks */}
        {[-0.16, 0.16].map((x) => (
          <group key={x} position={[x, 0.88, 0.28]}>
            <mesh rotation-z={Math.PI / 2} material={mats.steelDark}>
              <cylinderGeometry args={[0.01, 0.01, 0.07, 8]} />
            </mesh>
            <mesh position={[x > 0 ? 0.05 : -0.05, 0, 0]} material={mats.amber}>
              <capsuleGeometry args={[0.022, 0.03, 4, 10]} />
            </mesh>
          </group>
        ))}
        {/* Handlebar: crossbar + risers + rubber grips at (±0.36, 1.12, 0.22) */}
        <group position={[0, 1.12, -0.5]}>
          <mesh rotation-z={Math.PI / 2} castShadow material={mats.chrome}>
            <cylinderGeometry args={[0.022, 0.022, 0.6, 10]} />
          </mesh>
          {[-0.36, 0.36].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh rotation-z={Math.PI / 2} material={mats.rubber}>
                <cylinderGeometry args={[0.032, 0.032, 0.14, 12]} />
              </mesh>
              {/* Brake / clutch levers */}
              <mesh position={[0, -0.03, 0.08]} rotation-x={0.5} material={mats.alloy}>
                <boxGeometry args={[0.015, 0.015, 0.12]} />
              </mesh>
            </group>
          ))}
          {/* Mirrors */}
          {[-0.24, 0.24].map((x) => (
            <group key={x} position={[x, 0.02, 0]}>
              <mesh position={[0, 0.09, 0]} rotation-z={x > 0 ? -0.25 : 0.25} material={mats.steelDark}>
                <cylinderGeometry args={[0.008, 0.008, 0.18, 8]} />
              </mesh>
              <mesh position={[0, 0.19, 0]} rotation-y={x > 0 ? 0.3 : -0.3} material={mats.mirror}>
                <cylinderGeometry args={[0.05, 0.05, 0.012, 18]} />
              </mesh>
              <mesh position={[0, 0.19, 0]} rotation-y={x > 0 ? 0.3 : -0.3} material={mats.black}>
                <cylinderGeometry args={[0.053, 0.053, 0.008, 18]} />
              </mesh>
            </group>
          ))}
          {/* Instrument pod */}
          <mesh position={[0, 0.05, -0.06]} material={mats.black}>
            <cylinderGeometry args={[0.055, 0.055, 0.05, 16]} />
          </mesh>
          <mesh position={[0, 0.078, -0.06]} rotation-x={-0.4} material={mats.glass}>
            <circleGeometry args={[0.045, 20]} />
          </mesh>
        </group>
        {/* Bar risers down to triple clamp */}
        {[-0.07, 0.07].map((x) => (
          <mesh key={x} position={[x, 1.03, -0.44]} rotation-x={0.35} material={mats.steelDark}>
            <cylinderGeometry args={[0.02, 0.02, 0.2, 8]} />
          </mesh>
        ))}
      </group>

      {/* ---------- Side stand (pivot preserved for park animation) ---------- */}
      <group ref={standRef} position={[0.22, 0.32, -0.3]}>
        <mesh position={[0, -0.15, 0]} castShadow material={mats.steelDark}>
          <cylinderGeometry args={[0.022, 0.028, 0.36, 8]} />
        </mesh>
        <mesh position={[0, -0.32, 0.03]} material={mats.steelDark}>
          <boxGeometry args={[0.09, 0.04, 0.15]} />
        </mesh>
      </group>
    </group>
  );
}
