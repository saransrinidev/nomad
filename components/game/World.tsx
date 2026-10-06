// Infinite-feeling terrain: one large ground plane with a repeating grass
// texture that follows the player (snapped to the tile grid so the texture
// never swims), plus instanced trees/rocks that toroidally wrap around the
// player. One draw call for the ground, three for all scatter.

"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import * as THREE from "three";
import {
  GROUND_SIZE,
  GROUND_TILE_WORLD,
  SCATTER_RANGE,
  SKY_SUN_POSITION,
} from "@/lib/game/gameConstants";
import { getFocusPoint, type GameWorld } from "@/lib/game/state";

function makeGrassTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#7fbf5f";
  ctx.fillRect(0, 0, size, size);
  // Subtle two-tone checker for a stylized mown-grass feel.
  ctx.fillStyle = "#77b457";
  ctx.fillRect(0, 0, size / 2, size / 2);
  ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
  // Speckle noise.
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? "#86c768" : "#6fae4f";
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const tiles = GROUND_SIZE / GROUND_TILE_WORLD;
  tex.repeat.set(tiles, tiles);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

interface ScatterItem {
  x: number;
  z: number;
  scale: number;
  rot: number;
}

function scatter(count: number, seed: number, minR: number, maxR: number): ScatterItem[] {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const items: ScatterItem[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = minR + rand() * (maxR - minR);
    items.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      scale: 0.7 + rand() * 0.9,
      rot: rand() * Math.PI * 2,
    });
  }
  return items;
}

/** Wrap a coordinate into [-range/2, range/2) relative to center. */
function wrapDelta(value: number, center: number, range: number) {
  let d = (value - center) % range;
  if (d > range / 2) d -= range;
  if (d < -range / 2) d += range;
  return center + d;
}

export default function World({ worldRef }: { worldRef: RefObject<GameWorld> }) {
  const groundRef = useRef<THREE.Mesh>(null!);
  const trunkRef = useRef<THREE.InstancedMesh>(null!);
  const foliageRef = useRef<THREE.InstancedMesh>(null!);
  const rockRef = useRef<THREE.InstancedMesh>(null!);
  const lightRef = useRef<THREE.DirectionalLight>(null!);

  // Scratch objects reused every frame (never recreated, never re-rendered).
  const scratch = useMemo(
    () => ({ dummy: new THREE.Object3D(), target: new THREE.Object3D() }),
    [],
  );

  const grass = useMemo(
    () => (typeof document === "undefined" ? null : makeGrassTexture()),
    [],
  );

  // Geometries with baked Y offsets so instance matrices sit at ground level.
  const trunkGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.22, 0.32, 1.8, 6);
    g.translate(0, 0.9, 0);
    return g;
  }, []);
  const foliageGeo = useMemo(() => {
    const g = new THREE.ConeGeometry(1.6, 3.4, 7);
    g.translate(0, 3.1, 0);
    return g;
  }, []);
  const rockGeo = useMemo(() => new THREE.DodecahedronGeometry(0.7, 0), []);

  const trees = useMemo(() => scatter(130, 12345, 18, SCATTER_RANGE / 2), []);
  const rocks = useMemo(() => scatter(45, 987, 12, SCATTER_RANGE / 2), []);

  useFrame(() => {
    const world = worldRef.current;
    if (world.paused) return;
    const { dummy, target } = scratch;
    const focus = getFocusPoint(world);
    // Snap the ground to whole tiles so the repeating texture stays fixed
    // in world space while the mesh follows the player.
    groundRef.current.position.set(
      Math.round(focus.x / GROUND_TILE_WORLD) * GROUND_TILE_WORLD,
      0,
      Math.round(focus.z / GROUND_TILE_WORLD) * GROUND_TILE_WORLD,
    );

    // Keep the sun near the player so shadows stay crisp everywhere.
    lightRef.current.position.set(focus.x + 40, 55, focus.z + 25);
    target.position.set(focus.x, 0, focus.z);
    target.updateMatrixWorld();

    // Toroidally wrap scatter around the player for endless variety.
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      dummy.position.set(
        wrapDelta(t.x, focus.x, SCATTER_RANGE),
        0,
        wrapDelta(t.z, focus.z, SCATTER_RANGE),
      );
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      trunkRef.current.setMatrixAt(i, dummy.matrix);
      foliageRef.current.setMatrixAt(i, dummy.matrix);
    }
    trunkRef.current.instanceMatrix.needsUpdate = true;
    foliageRef.current.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i];
      dummy.position.set(
        wrapDelta(r.x, focus.x, SCATTER_RANGE),
        0.3 * r.scale,
        wrapDelta(r.z, focus.z, SCATTER_RANGE),
      );
      dummy.rotation.set(0, r.rot, 0);
      dummy.scale.setScalar(r.scale);
      dummy.updateMatrix();
      rockRef.current.setMatrixAt(i, dummy.matrix);
    }
    rockRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <Sky
        distance={450000}
        sunPosition={SKY_SUN_POSITION}
        turbidity={6}
        rayleigh={1.8}
      />
      <hemisphereLight args={["#cfeaff", "#6a8f5a", 0.75]} />
      <directionalLight
        ref={lightRef}
        castShadow
        intensity={1.6}
        color="#fff4e0"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-bias={-0.0004}
        target={scratch.target}
      />
      <primitive object={scratch.target} />

      <mesh ref={groundRef} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        {grass ? (
          <meshStandardMaterial map={grass} roughness={1} metalness={0} />
        ) : (
          <meshStandardMaterial color="#7fbf5f" roughness={1} metalness={0} />
        )}
      </mesh>

      <instancedMesh
        ref={trunkRef}
        args={[trunkGeo, undefined, trees.length]}
        castShadow
        frustumCulled={false}
      >
        <meshStandardMaterial color="#7a5230" roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={foliageRef}
        args={[foliageGeo, undefined, trees.length]}
        castShadow
        frustumCulled={false}
      >
        <meshStandardMaterial color="#3f7d36" roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={rockRef}
        args={[rockGeo, undefined, rocks.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <meshStandardMaterial color="#8d8d94" roughness={1} flatShading />
      </instancedMesh>
    </group>
  );
}
