// In-world "Press E to enter {label}" billboard, anchored above the nearest
// building door. Mirrors BikePrompt's pattern (drei Html following a world
// position, visible prop). Also used (with label "exit") inside interiors.

"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { GameWorld } from "@/lib/game/state";
import { BUILDING_DOORS } from "@/lib/game/map/village";

export default function DoorPrompt({
  worldRef,
  visible,
}: {
  worldRef: RefObject<GameWorld>;
  visible: boolean;
}) {
  const anchor = useRef<THREE.Group>(null!);
  const labelRef = useRef<HTMLSpanElement>(null!);
  const lastLabel = useRef("");

  useFrame(() => {
    if (!anchor.current) return;
    const w = worldRef.current;
    const idx = w.nearDoor;
    if (idx === null || idx < 0 || idx >= BUILDING_DOORS.length) return;
    const d = BUILDING_DOORS[idx];
    anchor.current.position.set(d.x, 2.6, d.z);
    if (labelRef.current && d.label !== lastLabel.current) {
      lastLabel.current = d.label;
      labelRef.current.textContent = d.label;
    }
  });

  if (!visible) return null;

  return (
    <group ref={anchor}>
      <Html center zIndexRange={[5, 0]} style={{ pointerEvents: "none", userSelect: "none" }}>
        <div className="animate-bounce rounded-full border border-white/20 bg-black/60 px-5 py-2 text-sm font-semibold whitespace-nowrap text-white backdrop-blur-sm">
          Press <span className="font-mono text-amber-300">E</span> to enter{" "}
          <span ref={labelRef} className="text-emerald-300" />
        </div>
      </Html>
    </group>
  );
}
