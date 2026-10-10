// Keyboard input: a single global listener writes into the shared
// mutable GameWorld (held in a ref, so no React re-renders) where useFrame
// loops can poll keys. E (interact) is handled separately in Game.tsx
// since it needs React state.

"use client";

import { useEffect, type RefObject } from "react";
import type { GameWorld } from "./state";

const CODE_MAP: Record<string, "forward" | "back" | "left" | "right"> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

export function useKeyboardInput(worldRef: RefObject<GameWorld>) {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!worldRef.current) return;
      const world = worldRef.current;
      const keys = world.keys;
      const dir = CODE_MAP[e.code];
      // While the fullscreen map / spawn picker is open the pre-menu held
      // keys are frozen for restore on close — ignore live presses (but
      // still swallow scrolling keys so the page never moves under the menu).
      if (world.mapOpen || world.spawnOpen) {
        if (dir || e.code === "Space") e.preventDefault();
        return;
      }
      if (dir) {
        keys[dir] = true;
        e.preventDefault();
        return;
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        keys.run = true;
        return;
      }
      if (e.code === "Space") {
        keys.brake = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (!worldRef.current) return;
      const world = worldRef.current;
      // Releases while a menu is open are ignored too — the snapshot
      // taken on open is restored verbatim on close.
      if (world.mapOpen || world.spawnOpen) return;
      const keys = world.keys;
      const dir = CODE_MAP[e.code];
      if (dir) {
        keys[dir] = false;
        return;
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        keys.run = false;
        return;
      }
      if (e.code === "Space") keys.brake = false;
    };
    const blur = () => {
      if (!worldRef.current) return;
      const keys = worldRef.current.keys;
      keys.forward = false;
      keys.back = false;
      keys.left = false;
      keys.right = false;
      keys.run = false;
      keys.brake = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [worldRef]);
}
