// Chunked instanced meshes: split world-space instances into spatial grid
// cells so three.js can frustum-cull whole chunks automatically.
//
// Why this beats the old approach (useStreamInstances):
// - Old: ONE InstancedMesh per layer with frustumCulled={false} + CPU
//   rewrite of every matrix each time the camera moves 70 m. Everything
//   inside the 900/1500 m radius is drawn even when behind the camera,
//   and all 7 layers rewrite at once = hitch while moving.
// - New: N small InstancedMeshes (one per ~500 m cell), matrices written
//   ONCE, boundingSphere computed per chunk, frustumCulled=true. Off-screen
//   chunks cost zero GPU. Far chunks hide via a cheap visible-flag sweep
//   (no matrix uploads). One shared useFrame per ChunkedInstancedMesh.

"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { qualityViewRadius } from "@/lib/game/quality";
import type { StreamItem } from "./instanceStream";

const DEFAULT_CHUNK = 500;
// Re-evaluate chunk visibility only after the camera meaningfully moves
// or the quality radius changes.
const RECHECK_M = 60;

interface Chunk<T extends StreamItem> {
  key: string;
  cx: number;
  cz: number;
  // Half-diagonal of the cell + longest instance, so the radius test keeps
  // chunks whose edge pokes into view.
  pad: number;
  items: T[];
}

function chunkItems<T extends StreamItem>(items: T[], size: number): Chunk<T>[] {
  const map = new Map<string, Chunk<T>>();
  for (const it of items) {
    const ix = it.x + (it.dx ?? 0);
    const iz = it.z + (it.dz ?? 0);
    const gx = Math.floor(ix / size);
    const gz = Math.floor(iz / size);
    const key = `${gx}:${gz}`;
    let c = map.get(key);
    if (!c) {
      c = {
        key,
        cx: (gx + 0.5) * size,
        cz: (gz + 0.5) * size,
        pad: Math.SQRT2 * size * 0.5,
        items: [],
      };
      map.set(key, c);
    }
    c.items.push(it);
    const halfLen = (it.len ?? 1) / 2;
    if (halfLen > 0 && c.pad < Math.SQRT2 * size * 0.5 + halfLen) {
      c.pad = Math.SQRT2 * size * 0.5 + halfLen;
    }
  }
  return [...map.values()];
}

function fillChunk<T extends StreamItem>(
  mesh: THREE.InstancedMesh,
  items: T[],
  baseLen: number,
  dummy: THREE.Object3D,
) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    dummy.position.set(it.x + (it.dx ?? 0), it.y, it.z + (it.dz ?? 0));
    dummy.rotation.set(0, it.yaw, 0);
    dummy.scale.set(1, 1, (it.len ?? baseLen) / baseLen);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  // Makes per-chunk frustum culling work (three culls InstancedMesh by
  // this sphere when frustumCulled=true).
  mesh.computeBoundingSphere();
  if (mesh.geometry.boundingSphere === null) mesh.geometry.computeBoundingSphere();
}

function ChunkMesh<T extends StreamItem>({
  chunk,
  baseLen,
  dummy,
  register,
  children,
}: {
  chunk: Chunk<T>;
  baseLen: number;
  dummy: THREE.Object3D;
  register: (key: string, mesh: THREE.InstancedMesh | null) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    fillChunk(m, chunk.items, baseLen, dummy);
    register(chunk.key, m);
    return () => register(chunk.key, null);
  }, [chunk, baseLen, dummy, register]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, chunk.items.length]}
      frustumCulled
      userData={{ cx: chunk.cx, cz: chunk.cz, pad: chunk.pad }}
    >
      {children}
    </instancedMesh>
  );
}

export function ChunkedInstancedMesh<T extends StreamItem>({
  items,
  baseLen,
  chunkSize = DEFAULT_CHUNK,
  stride = 1,
  children,
}: {
  items: T[];
  baseLen: number;
  chunkSize?: number;
  /** Draw every Nth item (sleepers thin out on low quality). */
  stride?: number;
  children: React.ReactNode;
}) {
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const meshes = useRef(new Map<string, THREE.InstancedMesh>());
  const register = useMemo(
    () => (key: string, mesh: THREE.InstancedMesh | null) => {
      if (mesh) meshes.current.set(key, mesh);
      else meshes.current.delete(key);
    },
    [],
  );
  const chunks = useMemo(() => {
    if (stride <= 1) return chunkItems(items, chunkSize);
    const filtered = items.filter((_, i) => i % stride === 0);
    return chunkItems(filtered, chunkSize);
  }, [items, chunkSize, stride]);
  const last = useRef({ x: Infinity, z: Infinity, radius: -1 });

  // Cheap radius gate per chunk (visible flag only — no matrix uploads).
  // Frustum culling itself is done by three.js per chunk sphere.
  useFrame(({ camera }) => {
    const radius = qualityViewRadius();
    const cx = camera.position.x;
    const cz = camera.position.z;
    const dx = cx - last.current.x;
    const dz = cz - last.current.z;
    if (
      last.current.x !== Infinity &&
      dx * dx + dz * dz < RECHECK_M * RECHECK_M &&
      last.current.radius === radius
    ) {
      return;
    }
    last.current = { x: cx, z: cz, radius };
    for (const mesh of meshes.current.values()) {
      const ux = mesh.userData.cx as number;
      const uz = mesh.userData.cz as number;
      const pad = mesh.userData.pad as number;
      const ddx = ux - cx;
      const ddz = uz - cz;
      const r = radius + pad;
      mesh.visible = ddx * ddx + ddz * ddz < r * r;
    }
  });

  if (chunks.length === 0) return null;
  return (
    <group>
      {chunks.map((c) => (
        <ChunkMesh key={c.key} chunk={c} baseLen={baseLen} dummy={dummy} register={register}>
          {children}
        </ChunkMesh>
      ))}
    </group>
  );
}

/** Fill-once helper for small LOCAL-space instance sets (shed lamps etc):
 *  writes matrices a single time, computes bounds, leaves frustumCulled
 *  on so three.js culls the whole set when the shed is off-screen. */
export function useStaticInstances(
  ref: React.RefObject<THREE.InstancedMesh | null>,
  items: StreamItem[],
  baseLen: number,
) {
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m || items.length === 0) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      dummy.position.set(it.x + (it.dx ?? 0), it.y, it.z + (it.dz ?? 0));
      dummy.rotation.set(0, it.yaw, 0);
      dummy.scale.set(1, 1, (it.len ?? baseLen) / baseLen);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [ref, items, baseLen]);
}
