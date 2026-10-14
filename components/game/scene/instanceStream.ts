// Stream InstancedMesh contents around the camera. Three.js frustum-culls
// InstancedMesh against the *unit* geometry sphere, so a 16 km rail mesh
// with frustumCulled=true vanishes; with it false every instance is drawn.
// Writing only nearby matrices and setting mesh.count is the real cull.

"use client";

import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { qualityViewRadius } from "@/lib/game/quality";

export interface StreamItem {
  x: number;
  y: number;
  z: number;
  yaw: number;
  len?: number;
  dx?: number;
  dz?: number;
}

const MOVE_M = 70;

export function useStreamInstances(
  ref: RefObject<THREE.InstancedMesh | null>,
  items: StreamItem[],
  baseLen: number,
  strideFn?: () => number,
) {
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const last = useRef({ x: Infinity, z: Infinity, stride: -1, radius: -1 });

  useLayoutEffect(() => {
    const m = ref.current;
    if (m) m.count = 0;
    last.current.x = Infinity;
  }, [ref, items]);

  useFrame(({ camera }) => {
    const m = ref.current;
    if (!m || items.length === 0) return;
    const radius = qualityViewRadius();
    const stride = Math.max(1, strideFn?.() ?? 1);
    const cx = camera.position.x;
    const cz = camera.position.z;
    const movedX = cx - last.current.x;
    const movedZ = cz - last.current.z;
    if (
      movedX * movedX + movedZ * movedZ < MOVE_M * MOVE_M &&
      last.current.stride === stride &&
      last.current.radius === radius &&
      m.count >= 0 &&
      last.current.x !== Infinity
    ) {
      return;
    }
    last.current = { x: cx, z: cz, stride, radius };
    const r2 = radius * radius;
    let n = 0;
    for (let i = 0; i < items.length; i += stride) {
      const it = items[i];
      const ix = it.x + (it.dx ?? 0);
      const iz = it.z + (it.dz ?? 0);
      const dx = ix - cx;
      const dz = iz - cz;
      if (dx * dx + dz * dz > r2) continue;
      dummy.position.set(ix, it.y, iz);
      dummy.rotation.set(0, it.yaw, 0);
      dummy.scale.set(1, 1, (it.len ?? baseLen) / baseLen);
      dummy.updateMatrix();
      m.setMatrixAt(n++, dummy.matrix);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  });
}
