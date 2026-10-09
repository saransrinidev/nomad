// God-view camera for map editing: top-down pan/zoom rig, 1 km tile grid,
// brush cursor ring, and stroke application (sculpt + paint). Active only in
// editor mode; the third-person camera unmounts while this runs.

"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  applyBrush,
  getTerrainMesh,
  groundHeight,
  paintAt,
  TILES_PER_SIDE,
  TILE_METERS,
  WORLD_HALF,
  type EditorRuntime,
} from "@/lib/game/map/terrain";
import type { GameWorld } from "@/lib/game/state";

export default function GodCamera({
  worldRef,
  editorRef,
}: {
  worldRef: RefObject<GameWorld>;
  editorRef: RefObject<EditorRuntime>;
}) {
  const { gl, camera } = useThree();
  const pan = useRef({ x: 0, z: 0, h: 1400 });
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const ringRef = useRef<THREE.Mesh>(null!);

  const gridGeo = useMemo(() => {
    const pts: number[] = [];
    for (let i = 0; i <= TILES_PER_SIDE; i++) {
      const c = -WORLD_HALF + i * TILE_METERS;
      pts.push(c, 0, -WORLD_HALF, c, 0, WORLD_HALF);
      pts.push(-WORLD_HALF, 0, c, WORLD_HALF, 0, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    return g;
  }, []);

  const borderGeo = useMemo(() => {
    const h = WORLD_HALF;
    const pts = new Float32Array([-h, 0, -h, h, 0, -h, h, 0, -h, h, 0, h, h, 0, h, -h, 0, h, -h, 0, h, -h, 0, -h]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    return g;
  }, []);

  useEffect(() => {
    const el = gl.domElement;
    const setNdc = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const pick = (e: PointerEvent) => {
      const mesh = getTerrainMesh();
      if (!mesh) return;
      setNdc(e);
      raycaster.setFromCamera(ndc, camera);
      // Recursive: the terrain is a group of chunk meshes.
      const hit = raycaster.intersectObject(mesh, true)[0];
      const ed = editorRef.current;
      if (hit) {
        ed.cursorX = THREE.MathUtils.clamp(hit.point.x, -WORLD_HALF, WORLD_HALF);
        ed.cursorZ = THREE.MathUtils.clamp(hit.point.z, -WORLD_HALF, WORLD_HALF);
        ed.cursorValid = true;
      } else {
        ed.cursorValid = false;
      }
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pick(e);
      const ed = editorRef.current;
      if (!ed.cursorValid) return;
      ed.stroking = true;
      ed.flatHeight = groundHeight(ed.cursorX, ed.cursorZ);
    };
    const onMove = (e: PointerEvent) => {
      pick(e);
    };
    const onUp = () => {
      editorRef.current.stroking = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = pan.current;
      p.h = THREE.MathUtils.clamp(p.h * Math.exp(e.deltaY * 0.001), 150, 3500);
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, [gl, camera, raycaster, ndc, editorRef]);

  useFrame(({ camera: cam }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const ed = editorRef.current;
    const p = pan.current;

    // WASD pans the god view (player sim is frozen while editing).
    const keys = worldRef.current.keys;
    const panSpeed = p.h * 0.9 * dt;
    if (keys.forward) p.z -= panSpeed;
    if (keys.back) p.z += panSpeed;
    if (keys.left) p.x -= panSpeed;
    if (keys.right) p.x += panSpeed;
    p.x = THREE.MathUtils.clamp(p.x, -WORLD_HALF, WORLD_HALF);
    p.z = THREE.MathUtils.clamp(p.z, -WORLD_HALF, WORLD_HALF);

    // Slight tilt keeps lookAt stable at exact top-down.
    cam.position.set(p.x, p.h, p.z + p.h * 0.03);
    cam.lookAt(p.x, 0, p.z);
    if (cam instanceof THREE.PerspectiveCamera && cam.fov !== 55) {
      cam.fov = 55;
      cam.updateProjectionMatrix();
    }

    // Apply the active stroke.
    if (ed.stroking && ed.cursorValid) {
      if (ed.tool === "paint") {
        paintAt(ed.cursorX, ed.cursorZ, ed.brushRadius, ed.paintLayer);
      } else {
        applyBrush(ed.cursorX, ed.cursorZ, ed.brushRadius, ed.strength * dt, ed.tool, ed.flatHeight);
      }
    }

    // Brush ring follows the cursor.
    if (ringRef.current) {
      ringRef.current.visible = ed.cursorValid;
      if (ed.cursorValid) {
        ringRef.current.position.set(ed.cursorX, groundHeight(ed.cursorX, ed.cursorZ) + 1.5, ed.cursorZ);
        const s = ed.brushRadius;
        ringRef.current.scale.set(s, s, s);
      }
    }
  });

  return (
    <group>
      {/* 1 km tile grid floating above max terrain */}
      <lineSegments geometry={gridGeo} position={[0, 65, 0]}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.22} />
      </lineSegments>
      <lineSegments geometry={borderGeo} position={[0, 65, 0]}>
        <lineBasicMaterial color="#ffd75e" transparent opacity={0.9} />
      </lineSegments>
      {/* Brush cursor ring */}
      <mesh ref={ringRef} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.93, 1, 48]} />
        <meshBasicMaterial color="#ffd75e" transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}
