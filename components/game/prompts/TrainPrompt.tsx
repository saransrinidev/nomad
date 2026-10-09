// Train interaction prompt projected in 3D (drei Html). Entry is fully
// physical (walk/jump through the doorways); this only hints sit/stand/lie
// near the furniture. No React polling — visibility is derived per frame
// with change-guarded state.

"use client";

import { useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { berthAnchorWorld, getLiveCars, seatAnchorWorld, seatProximity } from "@/lib/game/map/railway";
import type { GameWorld } from "@/lib/game/state";

export default function TrainPrompt({ worldRef }: { worldRef: RefObject<GameWorld> }) {
  const anchor = useRef<THREE.Group>(null!);
  const [key, setKey] = useState("");
  const lastKey = useRef("");

  useFrame(() => {
    const world = worldRef.current;
    if (!anchor.current) return;
    let next = "";
    if (world.mode === "walk" && !world.paused) {
      const furn = seatProximity(world);
      if (furn) {
        const cars = getLiveCars(furn.line);
        const c = cars[furn.car];
        const tr = world.trains.find((t) => t.line === furn.line);
        const tdir = tr ? tr.dir : 1;
        if (c) {
          const a =
            furn.kind === "berth" ? berthAnchorWorld(c, tdir) : seatAnchorWorld(c, furn.side, tdir);
          anchor.current.position.set(a.x, a.y + 1.6, a.z);
          next = furn.kind;
        }
      }
    } else if (world.mode === "train" && !world.paused) {
      const seat = world.trainSeat;
      anchor.current.position.set(world.playerPos.x, world.playerPos.y + 2.2, world.playerPos.z);
      next = seat?.lying ? "up" : "down";
    }
    if (next !== lastKey.current) {
      lastKey.current = next;
      setKey(next);
    }
  });

  if (!key) return null;

  return (
    <group ref={anchor}>
      <Html
        center
        zIndexRange={[5, 0]}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div className="animate-bounce rounded-full border border-white/20 bg-black/60 px-5 py-2 text-sm font-semibold whitespace-nowrap text-white backdrop-blur-sm">
          {key === "seat" && (
            <>
              Press <span className="font-mono text-amber-300">E</span> to sit
            </>
          )}
          {key === "berth" && (
            <>
              Press <span className="font-mono text-amber-300">E</span> to lie down
            </>
          )}
          {key === "down" && (
            <>
              <span className="font-mono text-amber-300">E</span> stand
              <span className="ml-2 text-white/70">
                &middot; <span className="font-mono text-amber-300">X</span> lie down
              </span>
            </>
          )}
          {key === "up" && (
            <>
              <span className="font-mono text-amber-300">E</span> stand
              <span className="ml-2 text-white/70">
                &middot; <span className="font-mono text-amber-300">X</span> sit up
              </span>
            </>
          )}
        </div>
      </Html>
    </group>
  );
}
