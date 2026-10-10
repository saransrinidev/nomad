// Infinite-feeling scatter that toroidally wraps around the player.
// (The ground itself is now the designed heightfield in Terrain.tsx.)

"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SCATTER_RANGE } from "@/lib/game/gameConstants";
import { groundHeight } from "@/lib/game/map/terrain";
import { getFocusPoint, type GameWorld } from "@/lib/game/state";

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
  const trunkRef = useRef<THREE.InstancedMesh>(null!);
  const foliageRef = useRef<THREE.InstancedMesh>(null!);
  const rockRef = useRef<THREE.InstancedMesh>(null!);

  // Scratch object reused every frame (never recreated, never re-rendered).
  const scratch = useMemo(() => ({ dummy: new THREE.Object3D() }), []);

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
    const { dummy } = scratch;
    const focus = getFocusPoint(world);

    // Toroidally wrap scatter around the player for endless variety.
    // Trees/rocks sit on the designed terrain height.
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      const wx = wrapDelta(t.x, focus.x, SCATTER_RANGE);
      const wz = wrapDelta(t.z, focus.z, SCATTER_RANGE);
      dummy.position.set(wx, groundHeight(wx, wz), wz);
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
      const wx = wrapDelta(r.x, focus.x, SCATTER_RANGE);
      const wz = wrapDelta(r.z, focus.z, SCATTER_RANGE);
      dummy.position.set(wx, groundHeight(wx, wz) + 0.3 * r.scale, wz);
      dummy.rotation.set(0, r.rot, 0);
      dummy.scale.setScalar(r.scale);
      dummy.updateMatrix();
      rockRef.current.setMatrixAt(i, dummy.matrix);
    }
    rockRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>

      <instancedMesh
        ref={trunkRef}
        args={[trunkGeo, undefined, trees.length]}
        castShadow
        frustumCulled={false}
      >
        <meshStandardMaterial color="#8f6238" roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={foliageRef}
        args={[foliageGeo, undefined, trees.length]}
        castShadow
        frustumCulled={false}
      >
        <meshStandardMaterial color="#2fa84f" roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={rockRef}
        args={[rockGeo, undefined, rocks.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <meshStandardMaterial color="#c9ccd4" roughness={1} flatShading />
      </instancedMesh>
    </group>
  );
}
