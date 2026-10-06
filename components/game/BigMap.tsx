// Fullscreen world map: the whole 1x1 km island with ocean surround,
// 100 m grid, corner lat/long, live player/bike/marker dots. Closes via
// the X button or ESC (handled in Game).

"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { renderMap } from "@/lib/game/map/mapRender";
import { metersToLatLong } from "@/lib/game/map/geo";
import type { GameWorld } from "@/lib/game/state";

const SIZE = 620;
const ZOOM_LEVELS = [350, 700, 1400]; // visible radius in meters

function cornerLabel(x: number, z: number): string {
  const { lat, lon } = metersToLatLong(x, z);
  return `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
}

export default function BigMap({
  worldRef,
  northUp,
  onClose,
}: {
  worldRef: RefObject<GameWorld>;
  northUp: boolean;
  onClose: () => void;
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
      if (now - last < 200) return;
      last = now;
      const w = worldRef.current;
      const riding = w.mode === "ride";
      const focus = riding ? w.bikePos : w.playerPos;
      const yaw = riding ? w.bikeYaw : w.playerYaw;
      renderMap(
        ctx,
        SIZE,
        RANGE,
        {
          focusX: focus.x,
          focusZ: focus.z,
          yaw,
          riding,
          bikeX: w.bikePos.x,
          bikeZ: w.bikePos.z,
          northUp,
        },
        { grid: true },
      );
      // Corner coordinates.
      ctx.fillStyle = "rgba(95,99,104,0.9)";
      ctx.font = "600 10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(cornerLabel(focus.x - RANGE, focus.z - RANGE), 10, 18);
      ctx.textAlign = "right";
      ctx.fillText(cornerLabel(focus.x + RANGE, focus.z + RANGE), SIZE - 10, SIZE - 10);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [worldRef, northUp, zoomIdx]);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm select-none">
      <div className="relative overflow-hidden rounded-2xl border border-white/20 shadow-2xl">
        <div className="flex items-center justify-between bg-white px-4 py-2.5">
          <span className="text-sm font-bold text-[#3c4043]">
            World Map &middot; 1 &times; 1 km
          </span>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-[#5f6368] hover:bg-black/10"
            title="Close (ESC)"
          >
            &times;
          </button>
        </div>
        <canvas ref={canvasRef} style={{ width: SIZE, height: SIZE }} className="block" />
        {/* Zoom controls */}
        <div className="absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-lg bg-white shadow-md">
          <button
            onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
            className="flex h-9 w-9 items-center justify-center text-lg font-bold text-[#5f6368] hover:bg-black/5 disabled:opacity-30"
            disabled={zoomIdx === 0}
          >
            +
          </button>
          <div className="h-px bg-black/10" />
          <button
            onClick={() => setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
            className="flex h-9 w-9 items-center justify-center text-lg font-bold text-[#5f6368] hover:bg-black/5 disabled:opacity-30"
            disabled={zoomIdx === ZOOM_LEVELS.length - 1}
          >
            −
          </button>
        </div>
        <div className="bg-white px-4 py-2 text-[11px] text-[#5f6368]">
          Blue dot is you &middot; red pin is the bike &middot; ESC to close
        </div>
      </div>
    </div>
  );
}
