// PlayerCharacter — reusable visual rig for the Nomad protagonist.
// Young male, ~1.75 m: messy wavy black hair, light-grey oversized hoodie
// (hood, drawstrings, cuffs, kangaroo pocket), black loose cargo pants,
// white/grey sneakers, black backpack. Faces +Z, feet at y=0 (root origin).
//
// VISUAL ONLY: no game state, no useFrame. The parent (Player.tsx) drives
// every joint through the CharacterRig handle, so the model can be swapped
// (e.g. a GLB via useGLTF mapped onto the same joint names) without touching
// movement, camera, or mounting code.
//
// Prototype note: built from clean primitives (capsules/spheres/rounded
// boxes) with shared PBR-ish materials — a stand-in until a sculpted,
// skinned asset replaces it. Proportions are realistic, not blocky.

"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/** Articulation handle driven by the movement controller. */
export interface CharacterRig {
  root: THREE.Group;
  lean: THREE.Group;
  thighL: THREE.Group;
  thighR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  upperArmL: THREE.Group;
  upperArmR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  head: THREE.Group;
}

/** Nominal height in metres (soles to hair crown). */
export const CHARACTER_HEIGHT = 1.75;

function useMaterials() {
  return useMemo(
    () => ({
      skin: new THREE.MeshStandardMaterial({ color: "#c68863", roughness: 0.65 }),
      hair: new THREE.MeshStandardMaterial({ color: "#100e11", roughness: 0.9 }),
      hoodie: new THREE.MeshStandardMaterial({ color: "#cfd2d8", roughness: 0.85 }),
      hoodieDark: new THREE.MeshStandardMaterial({ color: "#a9adb6", roughness: 0.9 }),
      cargo: new THREE.MeshStandardMaterial({ color: "#17171a", roughness: 0.9 }),
      cargoStitch: new THREE.MeshStandardMaterial({ color: "#2e2e33", roughness: 0.9 }),
      shoeUpper: new THREE.MeshStandardMaterial({ color: "#b9bdc4", roughness: 0.7 }),
      shoeWhite: new THREE.MeshStandardMaterial({ color: "#f2f3f5", roughness: 0.55 }),
      pack: new THREE.MeshStandardMaterial({ color: "#141518", roughness: 0.75 }),
      packDark: new THREE.MeshStandardMaterial({ color: "#0b0c0e", roughness: 0.8 }),
      metal: new THREE.MeshStandardMaterial({ color: "#9aa0a6", metalness: 0.9, roughness: 0.35 }),
      eyeWhite: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.35 }),
      eyeDark: new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.35 }),
      shades: new THREE.MeshStandardMaterial({ color: "#0c0d10", roughness: 0.15, metalness: 0.25 }),
    }),
    [],
  );
}

/** Messy wavy clumps: unit-sphere instances, varied scale/rotation. */
function Hair({ mats }: { mats: ReturnType<typeof useMaterials> }) {
  const geo = useMemo(() => new THREE.SphereGeometry(1, 8, 6), []);
  const clumps: { p: [number, number, number]; s: [number, number, number]; r: [number, number, number] }[] = [
    { p: [0, 0.1, 0], s: [0.13, 0.09, 0.13], r: [0, 0.4, 0] },
    { p: [-0.07, 0.07, 0.05], s: [0.07, 0.08, 0.07], r: [0.3, 0, 0.4] },
    { p: [0.07, 0.07, 0.05], s: [0.07, 0.08, 0.07], r: [0.3, 0, -0.4] },
    { p: [0, 0.05, 0.09], s: [0.06, 0.07, 0.05], r: [0.5, 0, 0] },
    { p: [-0.05, 0.0, 0.1], s: [0.045, 0.075, 0.045], r: [0.4, 0, 0.3] },
    { p: [0.05, 0.0, 0.1], s: [0.045, 0.075, 0.045], r: [0.4, 0, -0.3] },
    { p: [-0.105, 0.0, 0.0], s: [0.05, 0.095, 0.06], r: [0, 0, 0.35] },
    { p: [0.105, 0.0, 0.0], s: [0.05, 0.095, 0.06], r: [0, 0, -0.35] },
    { p: [-0.06, -0.03, -0.09], s: [0.06, 0.09, 0.05], r: [-0.3, 0.3, 0] },
    { p: [0.06, -0.03, -0.09], s: [0.06, 0.09, 0.05], r: [-0.3, -0.3, 0] },
    { p: [0, -0.05, -0.1], s: [0.075, 0.095, 0.05], r: [-0.4, 0, 0] },
    { p: [0, 0.1, -0.07], s: [0.095, 0.07, 0.07], r: [-0.5, 0.2, 0] },
    { p: [-0.04, 0.14, -0.01], s: [0.06, 0.05, 0.06], r: [0, 0.8, 0.3] },
    { p: [0.045, 0.135, 0.0], s: [0.055, 0.05, 0.055], r: [0.2, -0.6, -0.3] },
  ];
  return (
    <group>
      {clumps.map((c, i) => (
        <mesh key={i} geometry={geo} position={c.p} scale={c.s} rotation={c.r} castShadow material={mats.hair} />
      ))}
    </group>
  );
}

function Face({ mats }: { mats: ReturnType<typeof useMaterials> }) {
  return (
    <group>
      {/* Eyes only — the rest of the face stays clean */}
      {[-0.04, 0.04].map((x) => (
        <group key={x} position={[x, 0.015, 0]}>
          <mesh position={[0, 0, 0.098]} material={mats.eyeWhite}>
            <boxGeometry args={[0.035, 0.045, 0.012]} />
          </mesh>
          <mesh position={[0, 0, 0.104]} material={mats.eyeDark}>
            <boxGeometry args={[0.018, 0.024, 0.008]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Coolers (sunglasses): glossy wayfarer lenses + bridge + temple arms. */
function Coolers({ mats }: { mats: ReturnType<typeof useMaterials> }) {
  return (
    <group position={[0, 0.018, 0]}>
      {[-0.044, 0.044].map((x, i) => (
        <mesh
          key={x}
          position={[x, 0, 0.104]}
          rotation-y={i === 0 ? 0.18 : -0.18}
          material={mats.shades}
        >
          <boxGeometry args={[0.072, 0.052, 0.018]} />
        </mesh>
      ))}
      {/* Bridge */}
      <mesh position={[0, 0.008, 0.106]} material={mats.shades}>
        <boxGeometry args={[0.028, 0.01, 0.014]} />
      </mesh>
      {/* Temple arms back to the ears */}
      {[-0.082, 0.082].map((x) => (
        <mesh key={x} position={[x, 0.004, 0.055]} material={mats.shades}>
          <boxGeometry args={[0.012, 0.012, 0.1]} />
        </mesh>
      ))}
    </group>
  );
}

function Backpack({ mats }: { mats: ReturnType<typeof useMaterials> }) {
  return (
    <group position={[0, 1.2, -0.24]}>
      {/* Main pack */}
      <mesh castShadow material={mats.pack}>
        <boxGeometry args={[0.3, 0.4, 0.18]} />
      </mesh>
      {/* Front compartment */}
      <mesh position={[0, -0.08, -0.12]} castShadow material={mats.packDark}>
        <boxGeometry args={[0.24, 0.2, 0.08]} />
      </mesh>
      {/* Top zipper + pull tab */}
      <mesh position={[0, 0.19, -0.06]} material={mats.metal}>
        <boxGeometry args={[0.2, 0.018, 0.02]} />
      </mesh>
      <mesh position={[0.06, 0.165, -0.06]} material={mats.packDark}>
        <boxGeometry args={[0.025, 0.05, 0.012]} />
      </mesh>
      {/* Shoulder straps over the shoulders to the chest */}
      {[-0.13, 0.13].map((x) => (
        <mesh key={x} position={[x, 0.1, 0.2]} rotation-x={-0.25} castShadow material={mats.pack}>
          <boxGeometry args={[0.07, 0.42, 0.03]} />
        </mesh>
      ))}
      {/* Side pockets */}
      {[-0.17, 0.17].map((x) => (
        <mesh key={x} position={[x, -0.08, 0]} material={mats.packDark}>
          <boxGeometry args={[0.06, 0.14, 0.12]} />
        </mesh>
      ))}
      {/* Top grab handle */}
      <mesh position={[0, 0.23, 0]} material={mats.packDark}>
        <torusGeometry args={[0.035, 0.012, 8, 16, Math.PI]} />
      </mesh>
    </group>
  );
}

function Shoe({ mats }: { mats: ReturnType<typeof useMaterials> }) {
  return (
    <group>
      {/* Sole */}
      <mesh position={[0, -0.065, 0.03]} material={mats.shoeWhite}>
        <boxGeometry args={[0.11, 0.07, 0.3]} />
      </mesh>
      {/* Upper */}
      <mesh position={[0, 0.01, 0.01]} material={mats.shoeUpper}>
        <boxGeometry args={[0.1, 0.09, 0.22]} />
      </mesh>
      {/* Toe cap */}
      <mesh position={[0, -0.03, 0.13]} scale={[1, 0.7, 1]} material={mats.shoeWhite}>
        <sphereGeometry args={[0.055, 12, 8]} />
      </mesh>
      {/* Laces */}
      {[0.02, 0.055, 0.09].map((z) => (
        <mesh key={z} position={[0, 0.058, z]} rotation-x={-0.25} material={mats.shoeWhite}>
          <boxGeometry args={[0.07, 0.012, 0.02]} />
        </mesh>
      ))}
      {/* Side stripe */}
      {[-0.052, 0.052].map((x) => (
        <mesh key={x} position={[x, 0.0, 0.02]} material={mats.shoeWhite}>
          <boxGeometry args={[0.008, 0.03, 0.16]} />
        </mesh>
      ))}
    </group>
  );
}

export default function PlayerCharacter({ rigRef }: { rigRef: { current: CharacterRig | null } }) {
  const mats = useMaterials();
  const root = useRef<THREE.Group>(null!);
  const lean = useRef<THREE.Group>(null!);
  const thighL = useRef<THREE.Group>(null!);
  const thighR = useRef<THREE.Group>(null!);
  const kneeL = useRef<THREE.Group>(null!);
  const kneeR = useRef<THREE.Group>(null!);
  const upperArmL = useRef<THREE.Group>(null!);
  const upperArmR = useRef<THREE.Group>(null!);
  const elbowL = useRef<THREE.Group>(null!);
  const elbowR = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);

  useLayoutEffect(() => {
    rigRef.current = {
      root: root.current,
      lean: lean.current,
      thighL: thighL.current,
      thighR: thighR.current,
      kneeL: kneeL.current,
      kneeR: kneeR.current,
      upperArmL: upperArmL.current,
      upperArmR: upperArmR.current,
      elbowL: elbowL.current,
      elbowR: elbowR.current,
      head: head.current,
    };
  }, [rigRef]);

  const leg = (side: 1 | -1, thighRef: typeof thighL, kneeRef: typeof kneeL) => (
    <group ref={thighRef} position={[0.1 * side, 0.92, 0]}>
      {/* Thigh (loose cargo fit, tapered to the knee) */}
      <mesh position={[0, -0.21, 0]} castShadow material={mats.cargo}>
        <cylinderGeometry args={[0.11, 0.088, 0.42, 12]} />
      </mesh>
      {/* Side cargo pocket */}
      <mesh position={[0.11 * side, -0.15, 0]} material={mats.cargo}>
        <boxGeometry args={[0.05, 0.14, 0.12]} />
      </mesh>
      {/* Knee stitching */}
      <mesh position={[0, -0.36, 0.1]} material={mats.cargoStitch}>
        <boxGeometry args={[0.16, 0.02, 0.015]} />
      </mesh>
      {/* Knee ball keeps volume when the joint bends */}
      <mesh position={[0, -0.42, 0]} castShadow material={mats.cargo}>
        <sphereGeometry args={[0.085, 12, 10]} />
      </mesh>
      <group ref={kneeRef} position={[0, -0.42, 0]}>
        {/* Shin (tapered to the ankle) */}
        <mesh position={[0, -0.2, 0]} castShadow material={mats.cargo}>
          <cylinderGeometry args={[0.088, 0.068, 0.4, 12]} />
        </mesh>
        {/* Ankle cuff fold */}
        <mesh position={[0, -0.36, 0]} material={mats.cargoStitch}>
          <torusGeometry args={[0.08, 0.014, 8, 16]} />
        </mesh>
        <group position={[0, -0.4, 0.02]}>
          <Shoe mats={mats} />
        </group>
      </group>
    </group>
  );

  const arm = (side: 1 | -1, upperRef: typeof upperArmL, elbowRef: typeof elbowL) => (
    <group ref={upperRef} position={[0.21 * side, 1.36, 0]}>
      {/* Shoulder cap hides the arm-torso seam when raised */}
      <mesh material={mats.hoodie}>
        <sphereGeometry args={[0.078, 12, 10]} />
      </mesh>
      {/* Upper arm (hoodie sleeve, tapered to the elbow) */}
      <mesh position={[0, -0.15, 0]} castShadow material={mats.hoodie}>
        <cylinderGeometry args={[0.075, 0.062, 0.3, 10]} />
      </mesh>
      {/* Elbow ball keeps volume when the joint bends */}
      <mesh position={[0, -0.3, 0]} material={mats.hoodie}>
        <sphereGeometry args={[0.06, 12, 10]} />
      </mesh>
      <group ref={elbowRef} position={[0, -0.3, 0]}>
        {/* Forearm (sleeve, tapered to the cuff) */}
        <mesh position={[0, -0.14, 0]} material={mats.hoodie}>
          <cylinderGeometry args={[0.06, 0.05, 0.28, 10]} />
        </mesh>
        {/* Ribbed cuff */}
        <mesh position={[0, -0.26, 0]} material={mats.hoodieDark}>
          <cylinderGeometry args={[0.062, 0.068, 0.07, 12]} />
        </mesh>
        {/* Hand + thumb nub */}
        <mesh position={[0, -0.33, 0.01]} scale={[0.9, 1.15, 0.9]} castShadow material={mats.skin}>
          <sphereGeometry args={[0.055, 12, 10]} />
        </mesh>
        <mesh position={[-0.04 * side, -0.31, 0.02]} rotation-z={0.5 * side} material={mats.skin}>
          <capsuleGeometry args={[0.018, 0.03, 4, 8]} />
        </mesh>
      </group>
    </group>
  );

  return (
    <group ref={root}>
      <group ref={lean}>
        {leg(1, thighL, kneeL)}
        {leg(-1, thighR, kneeR)}

        {/* Oversized hoodie: tapered torso (wide shoulders → waist) */}
        <mesh position={[0, 1.18, 0]} scale={[1, 1, 0.68]} castShadow material={mats.hoodie}>
          <cylinderGeometry args={[0.2, 0.165, 0.52, 14]} />
        </mesh>
        {/* Shoulder yoke */}
        <mesh position={[0, 1.4, 0]} scale={[1.35, 0.55, 0.75]} castShadow material={mats.hoodie}>
          <sphereGeometry args={[0.13, 16, 12]} />
        </mesh>
        {/* Hem ribbing */}
        <mesh position={[0, 0.95, 0]} scale={[1, 1, 0.7]} material={mats.hoodieDark}>
          <cylinderGeometry args={[0.175, 0.165, 0.09, 14]} />
        </mesh>
        {/* Fabric wrinkles gathering at the waist */}
        {[1.04, 1.1].map((y) => (
          <mesh key={y} position={[0, y, 0.005]} rotation-x={Math.PI / 2} scale={[1, 0.68, 1]} material={mats.hoodieDark}>
            <torusGeometry args={[0.168, 0.012, 8, 20]} />
          </mesh>
        ))}
        {/* Kangaroo pocket */}
        <mesh position={[0, 1.02, 0.14]} rotation-x={-0.12} material={mats.hoodie}>
          <boxGeometry args={[0.3, 0.2, 0.07]} />
        </mesh>
        {/* Hood ring + drape behind the neck */}
        <mesh position={[0, 1.44, -0.1]} rotation-x={0.5} material={mats.hoodie}>
          <torusGeometry args={[0.125, 0.05, 10, 20]} />
        </mesh>
        <mesh position={[0, 1.3, -0.17]} scale={[1.1, 0.9, 0.6]} material={mats.hoodie}>
          <sphereGeometry args={[0.12, 14, 10]} />
        </mesh>
        {/* Drawstrings + aglets */}
        {[-0.05, 0.05].map((x) => (
          <group key={x}>
            <mesh position={[x, 1.28, 0.145]} material={mats.shoeWhite}>
              <cylinderGeometry args={[0.008, 0.008, 0.22, 8]} />
            </mesh>
            <mesh position={[x, 1.16, 0.145]} material={mats.metal}>
              <sphereGeometry args={[0.012, 8, 8]} />
            </mesh>
          </group>
        ))}
        {/* Neck */}
        <mesh position={[0, 1.47, 0]} material={mats.skin}>
          <cylinderGeometry args={[0.055, 0.06, 0.08, 10]} />
        </mesh>

        {arm(1, upperArmL, elbowL)}
        {arm(-1, upperArmR, elbowR)}

        <Backpack mats={mats} />

        {/* Head (pivot at neck for nods/shakes) */}
        <group ref={head} position={[0, 1.6, 0]}>
          <mesh castShadow material={mats.skin}>
            <sphereGeometry args={[0.11, 20, 14]} />
          </mesh>
          {/* Jaw taper */}
          <mesh position={[0, -0.075, 0.01]} scale={[0.85, 0.7, 0.85]} material={mats.skin}>
            <sphereGeometry args={[0.07, 14, 10]} />
          </mesh>
          <Hair mats={mats} />
          <Face mats={mats} />
          <Coolers mats={mats} />
        </group>
      </group>
    </group>
  );
}
