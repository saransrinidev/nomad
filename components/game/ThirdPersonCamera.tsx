// Third-person orbit camera: rigidly follows the player (or bike when
// riding) with no smoothing lag. Look controls:
//   - HOLD right mouse button and move to look (release = camera stays put)
//   - CTRL hides the cursor (pointer lock) for button-free mouse-look;
//     CTRL again or ESC brings it back
//   - mouse wheel to zoom (persists while driving until mount/dismount)
// LMB does nothing; the right-click menu stays suppressed.

"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  BIKE_MAX_SPEED,
  CAM_DISTANCE,
  CAM_HEIGHT,
  CAM_MAX_DISTANCE,
  CAM_MAX_PITCH,
  CAM_MIN_DISTANCE,
  CAM_MIN_PITCH,
  CAM_RIDE_DISTANCE,
  type RideMode,
} from "@/lib/game/gameConstants";
import { getFocusPoint, type GameWorld } from "@/lib/game/state";

const LOCK_SENSITIVITY = 0.0025;
const HOLD_SENSITIVITY = 0.0042;

export default function ThirdPersonCamera({
  worldRef,
  onLockChange,
}: {
  worldRef: RefObject<GameWorld>;
  onLockChange: (locked: boolean) => void;
}) {
  const { gl } = useThree();
  const holdingRMB = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const lockedRef = useRef(false);
  const lastModeRef = useRef<RideMode>("walk");

  // Scratch vectors (memoized — never recreated per frame).
  const scratch = useRef<{ desired: THREE.Vector3; lookAt: THREE.Vector3 } | null>(null);
  if (scratch.current === null) {
    scratch.current = { desired: new THREE.Vector3(), lookAt: new THREE.Vector3() };
  }
  const vectors = scratch.current;

  useEffect(() => {
    const el = gl.domElement;

    // Idempotent: only propagates actual changes, so no event feedback
    // loop can ever recurse no matter how listeners are wired.
    const setLocked = (locked: boolean) => {
      if (lockedRef.current === locked) return;
      lockedRef.current = locked;
      onLockChange(locked);
    };

    const lock = () => {
      // Must be called from a user gesture (the CTRL keydown qualifies).
      try {
        const result = el.requestPointerLock() as unknown as
          | Promise<void>
          | undefined;
        result?.catch(() => {
          // Browser cooldown (e.g. relocking too fast after ESC) — ignore.
        });
      } catch {
        // Pointer lock unsupported — drag-to-rotate still works.
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "ControlLeft" || e.code === "ControlRight") {
        if (document.pointerLockElement === el) document.exitPointerLock();
        else lock();
      }
    };

    const onPointerLockChange = () => {
      setLocked(document.pointerLockElement === el);
    };

    // Camera look: pointer-locked deltas when CTRL-locked, otherwise the
    // camera moves only while the RIGHT mouse button is held (release =
    // no movement). LMB does nothing; the RMB menu stays suppressed.
    const onMouseMove = (e: MouseEvent) => {
      const cam = worldRef.current;
      if (lockedRef.current) {
        cam.camYaw -= e.movementX * LOCK_SENSITIVITY;
        cam.camPitch = THREE.MathUtils.clamp(
          cam.camPitch + e.movementY * LOCK_SENSITIVITY,
          CAM_MIN_PITCH,
          CAM_MAX_PITCH,
        );
      }
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 2 || lockedRef.current) return;
      holdingRMB.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!holdingRMB.current || lockedRef.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      const cam = worldRef.current;
      cam.camYaw -= dx * HOLD_SENSITIVITY;
      cam.camPitch = THREE.MathUtils.clamp(
        cam.camPitch + dy * HOLD_SENSITIVITY * 0.8,
        CAM_MIN_PITCH,
        CAM_MAX_PITCH,
      );
    };
    const onUp = (e: PointerEvent) => {
      if (e.button === 2) holdingRMB.current = false;
    };
    const onCancel = () => {
      holdingRMB.current = false;
    };

    // Mouse buttons do nothing: LMB drag-orbit is disabled and the
    // right-click menu is suppressed — camera look is CTRL + mouse only.
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = worldRef.current;
      cam.camDistance = THREE.MathUtils.clamp(
        cam.camDistance + e.deltaY * 0.01,
        CAM_MIN_DISTANCE,
        CAM_MAX_DISTANCE,
      );
      // Manual zoom wins: stop auto ride/walk reframing until mode changes.
      cam.camManualZoom = true;
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    el.addEventListener("contextmenu", onContextMenu);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("contextmenu", onContextMenu);
      el.removeEventListener("wheel", onWheel);
      if (document.pointerLockElement === el) document.exitPointerLock();
    };
  }, [gl, worldRef, onLockChange]);

  useFrame(({ camera }) => {
    const world = worldRef.current;
    const { desired, lookAt } = vectors;
    const focus = getFocusPoint(world);

    // Manual scroll-zoom persists until mount/dismount; otherwise snap to
    // the mode framing with no easing.
    if (world.mode !== lastModeRef.current) {
      lastModeRef.current = world.mode;
      worldRef.current.camManualZoom = false;
    }
    const dist = worldRef.current.camManualZoom
      ? world.camDistance
      : world.mode === "ride"
        ? CAM_RIDE_DISTANCE
        : CAM_DISTANCE;
    worldRef.current.camDistance = dist;

    const cp = Math.cos(world.camPitch);
    const sp = Math.sin(world.camPitch);
    desired.set(
      focus.x - Math.sin(world.camYaw) * cp * dist,
      focus.y + CAM_HEIGHT + sp * dist,
      focus.z - Math.cos(world.camYaw) * cp * dist,
    );
    // Never clip below the terrain.
    if (desired.y < 0.6) desired.y = 0.6;

    // Rigid follow: snap straight to the desired position.
    camera.position.copy(desired);
    lookAt.set(focus.x, focus.y + CAM_HEIGHT, focus.z);
    camera.lookAt(lookAt);

    // FOV follows speed directly, no lag.
    const pc = camera as THREE.PerspectiveCamera;
    const speedFrac =
      world.mode === "ride"
        ? Math.min(Math.abs(world.bikeSpeed) / BIKE_MAX_SPEED, 1)
        : 0;
    const targetFov = 55 + speedFrac * 13;
    if (pc.fov !== targetFov) {
      pc.fov = targetFov;
      pc.updateProjectionMatrix();
    }
  });

  return null;
}
