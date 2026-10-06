// Google-Maps-style minimap widget (bottom-left). Delegates all drawing to
// the shared map renderer. Click the map to open the fullscreen BigMap.
// Zoom +/- buttons, clickable compass (resets to north-up).

"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { renderMap, type MapSnapshot } from "@/lib/game/map/mapRender";
import type { GameWorld } from "@/lib/game/state";

const SIZE = 200;
const ZOOM_LEVELS = [60, 120, 240]; // visible radius in meters

function snapshot(w: GameWorld): MapSnapshot {
  const riding = w.mode === "ride";
  const focus = riding ? w.bikePos : w.playerPos;
  const yaw = riding ? w.bikeYaw : w.playerYaw;
  return {
    focusX: focus.x,
    focusZ: focus.z,
    yaw,
    riding,
    bikeX: w.bikePos.x,
    bikeZ: w.bikePos.z,
    northUp: true, // replaced per draw below
  };
}

export default function Minimap({
  worldRef,
  northUp,
  onToggleOrientation,
  onOpenMap,
}: {
  worldRef: RefObject<GameWorld>;
  northUp: boolean;
  onToggleOrientation: () => void;
  onOpenMap: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoomIdx, setZoomIdx] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    const RANGE = ZOOM_LEVELS[zoomIdx] ?? ZOOM_LEVELS[1];

    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 100) return;
      last = now;
      const w = worldRef.current;
      renderMap(ctx, SIZE, RANGE, { ...snapshot(w), northUp });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [worldRef, northUp, zoomIdx]);

  return (
    <div className="absolute bottom-4 left-4 z-10 select-none">
      <div className="relative overflow-hidden rounded-2xl border border-black/10 shadow-lg">
        <canvas
          ref={canvasRef}
          style={{ width: SIZE, height: SIZE }}
          className="block cursor-pointer"
          onClick={onOpenMap}
          title="Open fullscreen map"
        />
        {/* Compass: tap to return to north-up */}
        <button
          onClick={onToggleOrientation}
          title={northUp ? "Map is north-up" : "Tap to reset to north-up"}
          className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-black text-[#5f6368] shadow-md transition-transform hover:scale-105"
        >
          <span
            className="inline-block text-[#ea4335] transition-transform duration-300"
            style={{ transform: northUp ? "rotate(0deg)" : "rotate(180deg)" }}
          >
            N
          </span>
        </button>
        {/* Zoom controls */}
        <div className="absolute right-2 bottom-2 flex flex-col overflow-hidden rounded-lg bg-white shadow-md">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setZoomIdx((i) => Math.max(0, i - 1));
            }}
            className="flex h-8 w-8 items-center justify-center text-lg font-bold text-[#5f6368] hover:bg-black/5 disabled:opacity-30"
            disabled={zoomIdx === 0}
          >
            +
          </button>
          <div className="h-px bg-black/10" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1));
            }}
            className="flex h-8 w-8 items-center justify-center text-lg font-bold text-[#5f6368] hover:bg-black/5 disabled:opacity-30"
            disabled={zoomIdx === ZOOM_LEVELS.length - 1}
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
}
