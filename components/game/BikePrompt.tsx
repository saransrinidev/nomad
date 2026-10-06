// Interaction prompt projected above the motorcycle in 3D (drei Html).
// Follows the bike every frame via a group ref, so no React re-renders.
// Only mounted while the player is on foot and in range.

"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { GameWorld } from "@/lib/game/state";

export default function BikePrompt({
  worldRef,
  visible,
  engineOn,
}: {
  worldRef: RefObject<GameWorld>;
  visible: boolean;
  engineOn: boolean;
}) {
  const anchor = useRef<THREE.Group>(null!);

  useFrame(() => {
    if (!anchor.current) return;
    const b = worldRef.current.bikePos;
    anchor.current.position.set(b.x, 2.3, b.z);
  });

  if (!visible) return null;

  return (
    <group ref={anchor}>
      <Html
        center
        zIndexRange={[5, 0]}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div className="animate-bounce rounded-full border border-white/20 bg-black/60 px-5 py-2 text-sm font-semibold whitespace-nowrap text-white backdrop-blur-sm">
          Press <span className="font-mono text-amber-300">E</span> to ride
          {!engineOn && (
            <span className="ml-2 text-white/70">
              &middot; <span className="font-mono text-amber-300">X</span> starts engine
            </span>
          )}
        </div>
      </Html>
    </group>
  );
}
