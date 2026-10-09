// Fullscreen Tamil Nadu map: the whole 16x16 km plain with
// 1 km grid, district divisions, corner lat/long, live player/bike dots.
// Freely pannable (drag) + zoomable (wheel / buttons); dragging drops the
// follow-player lock — the target button snaps back. Closes via the X
// button, M, or ESC (handled in Game).

"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { headingAngle, renderMap } from "@/lib/game/map/mapRender";
import { getMapDivisions } from "@/lib/game/map/districts";
import { getRailwayMapData } from "@/lib/game/map/railway";
import { metersToLatLong } from "@/lib/game/map/geo";
import type { GameWorld } from "@/lib/game/state";

const SIZE = 620;
const DEFAULT_RANGE = 2000;
const MIN_RANGE = 300;
const MAX_RANGE = 12000;

function cornerLabel(x: number, z: number): string {
  const { lat, lon } = metersToLatLong(x, z);
  return `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
}

function clampRange(r: number): number {
  return Math.min(MAX_RANGE, Math.max(MIN_RANGE, r));
}

export default function BigMap({
  worldRef,
  northUp,
  district,
  onClose,
}: {
  worldRef: RefObject<GameWorld>;
  northUp: boolean;
  district: string | null;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [follow, setFollow] = useState(true);
  const [dragging, setDragging] = useState(false);
  // View center in game meters. Tracks the player while following.
  const centerRef = useRef({ x: 0, z: 0 });
  const dragRef = useRef({ active: false, lx: 0, ly: 0 });
  const rangeRef = useRef(DEFAULT_RANGE);
  rangeRef.current = range;
  const followRef = useRef(true);
  followRef.current = follow;
  const northUpRef = useRef(northUp);
  northUpRef.current = northUp;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

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
      if (followRef.current) {
        centerRef.current.x = focus.x;
        centerRef.current.z = focus.z;
      }
      const cx = centerRef.current.x;
      const cz = centerRef.current.z;
      const r = rangeRef.current;
      const div = getMapDivisions();
      renderMap(
        ctx,
        SIZE,
        r,
        {
          focusX: cx,
          focusZ: cz,
          px: w.playerPos.x,
          pz: w.playerPos.z,
          yaw,
          riding,
          bikeX: w.bikePos.x,
          bikeZ: w.bikePos.z,
          northUp: northUpRef.current,
        },
        {
          grid: true,
          districtRings: div.rings,
          districtLabels: div.labels,
          labelFont: "600 11px sans-serif",
          railway: getRailwayMapData(),
        },
      );
      // Corner coordinates of the current view.
      ctx.fillStyle = "rgba(95,99,104,0.9)";
      ctx.font = "600 10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(cornerLabel(cx - r, cz - r), 10, 18);
      ctx.textAlign = "right";
      ctx.fillText(cornerLabel(cx + r, cz + r), SIZE - 10, SIZE - 10);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [worldRef]);

  // Wheel zoom (native non-passive listener so the page never scrolls).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      setRange((r) => clampRange(r * Math.exp(ev.deltaY * 0.0012)));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  /** Pan the view so map content sticks to the pointer. */
  const panBy = (dxPx: number, dyPx: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = worldRef.current;
    const riding = w.mode === "ride";
    const yaw = riding ? w.bikeYaw : w.playerYaw;
    const a = northUpRef.current ? 0 : headingAngle(yaw);
    const s = SIZE / (rangeRef.current * 2); // px per meter
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // Inverse of the render transform: dfocus = -R(a) * dScreen / s.
    centerRef.current.x -= (ca * dxPx - sa * dyPx) / s;
    centerRef.current.z -= (sa * dxPx + ca * dyPx) / s;
  };

  const recenter = () => {
    const w = worldRef.current;
    const riding = w.mode === "ride";
    const focus = riding ? w.bikePos : w.playerPos;
    centerRef.current.x = focus.x;
    centerRef.current.z = focus.z;
    setFollow(true);
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm select-none">
      <div className="relative overflow-hidden rounded-2xl border border-white/20 shadow-2xl">
        <div className="flex items-center justify-between bg-white px-4 py-2.5">
          <span className="text-sm font-bold text-[#3c4043]">
            Tamil Nadu &middot; 16 &times; 16 km
            {district ? (
              <span className="text-[#5f6368]"> &middot; {district}</span>
            ) : null}
            {!follow ? (
              <span className="text-[#1a73e8]"> &middot; free view</span>
            ) : null}
          </span>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-[#5f6368] hover:bg-black/10"
            title="Close (M / ESC)"
          >
            &times;
          </button>
        </div>
        <canvas
          ref={canvasRef}
          style={{ width: SIZE, height: SIZE, touchAction: "none" }}
          className={dragging ? "block cursor-grabbing" : "block cursor-grab"}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            dragRef.current = { active: true, lx: e.clientX, ly: e.clientY };
            setDragging(true);
          }}
          onPointerMove={(e) => {
            if (!dragRef.current.active) return;
            const dx = e.clientX - dragRef.current.lx;
            const dy = e.clientY - dragRef.current.ly;
            dragRef.current.lx = e.clientX;
            dragRef.current.ly = e.clientY;
            if (dx !== 0 || dy !== 0) {
              if (followRef.current) setFollow(false);
              panBy(dx, dy);
            }
          }}
          onPointerUp={() => {
            dragRef.current.active = false;
            setDragging(false);
          }}
          onPointerCancel={() => {
            dragRef.current.active = false;
            setDragging(false);
          }}
        />
        {/* Recenter button (visible once panned away) */}
        {!follow && (
          <button
            onClick={recenter}
            title="Snap back to player"
            className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-black text-[#1a73e8] shadow-md hover:scale-105"
          >
            ◎
          </button>
        )}
        {/* Zoom controls */}
        <div className="absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-lg bg-white shadow-md">
          <button
            onClick={() => setRange((r) => clampRange(r / 1.4))}
            className="flex h-9 w-9 items-center justify-center text-lg font-bold text-[#5f6368] hover:bg-black/5 disabled:opacity-30"
            disabled={range <= MIN_RANGE}
          >
            +
          </button>
          <div className="h-px bg-black/10" />
          <button
            onClick={() => setRange((r) => clampRange(r * 1.4))}
            className="flex h-9 w-9 items-center justify-center text-lg font-bold text-[#5f6368] hover:bg-black/5 disabled:opacity-30"
            disabled={range >= MAX_RANGE}
          >
            −
          </button>
        </div>
        <div className="bg-white px-4 py-2 text-[11px] text-[#5f6368]">
          Drag to explore &middot; scroll to zoom &middot; blue dot is you
          &middot; M / ESC to close
        </div>
      </div>
    </div>
  );
}
