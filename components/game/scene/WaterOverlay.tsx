// Underwater tint while the camera is submerged (riverbeds, open sea).
// Writes straight to the #water-overlay div (no React re-renders): dry
// land and beach shallows never trigger, depth fades the tint in.

"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { groundHeight } from "@/lib/game/map/terrain";

const SURFACE_Y = 0.3;

export default function WaterOverlay() {
  const camera = useThree((s) => s.camera);
  const el = useRef<HTMLElement | null>(null);
  useFrame(() => {
    if (!el.current) {
      el.current = document.getElementById("water-overlay");
      if (!el.current) return;
    }
    let a = 0;
    const y = camera.position.y;
    if (y < SURFACE_Y) {
      const g = groundHeight(camera.position.x, camera.position.z);
      if (g < SURFACE_Y) a = Math.min(0.8, (SURFACE_Y - y) / 2.5);
    }
    el.current.style.opacity = a.toFixed(3);
  });
  return null;
}
