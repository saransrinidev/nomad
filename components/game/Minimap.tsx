// Google-Maps-style minimap widget (bottom-left). Light map tiles, blue-dot
// player with heading wedge, POI label, zoom +/- buttons, clickable compass
// (resets heading-up back to north-up). Canvas redrawn at ~10Hz from the
// shared world ref — zero React re-renders except for zoom level changes.

"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { LIBRARY_POSITION } from "@/lib/game/gameConstants";
import { VILLAGE_CENTER } from "@/lib/game/map/village";
import type { GameWorld } from "@/lib/game/state";

const SIZE = 200;
const ZOOM_LEVELS = [60, 120, 240]; // visible radius in meters

// Google palette accents
const LAND = "#e9ebe6";
const POI_FILL = "#cfd4da";
const POI_EDGE = "#9aa0a6";
const POI_TEXT = "#5f6368";
const GOOGLE_BLUE = "#1a73e8";
const GOOGLE_RED = "#ea4335";

export default function Minimap({
  worldRef,
  northUp,
  onToggleOrientation,
}: {
  worldRef: RefObject<GameWorld>;
  northUp: boolean;
  onToggleOrientation: () => void;
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
      const riding = w.mode === "ride";
      const focus = riding ? w.bikePos : w.playerPos;
      const yaw = riding ? w.bikeYaw : w.playerYaw;
      const s = SIZE / (RANGE * 2); // px per meter
      const C = SIZE / 2;
      // Heading angle on the map (0 = facing north = up).
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const headAngle = Math.atan2(fx, -fz);

      // Land tile.
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = LAND;
      ctx.fillRect(0, 0, SIZE, SIZE);

      ctx.save();
      ctx.beginPath();
      ctx.rect(4, 4, SIZE - 8, SIZE - 8);
      ctx.clip();

      // In heading-up mode, rotate the world so travel direction is up.
      ctx.save();
      ctx.translate(C, C);
      if (!northUp) ctx.rotate(-headAngle);
      ctx.translate(-C, -C);

      // Subtle range rings.
      ctx.strokeStyle = "rgba(0,0,0,0.08)";
      ctx.lineWidth = 1;
      for (const r of [RANGE / 2, RANGE - 4]) {
        ctx.beginPath();
        ctx.arc(C, C, r * s, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Library POI (clamped to the view when out of range).
      {
        const [lx, , lz] = LIBRARY_POSITION;
        let dx = (lx - focus.x) * s;
        let dz = (lz - focus.z) * s;
        const dist = Math.hypot(dx, dz);
        const maxR = C - 18;
        if (dist > maxR) {
          dx = (dx / dist) * maxR;
          dz = (dz / dist) * maxR;
        }
        ctx.fillStyle = POI_FILL;
        ctx.strokeStyle = POI_EDGE;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(C + dx - 6, C + dz - 6, 12, 12, 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = POI_TEXT;
        ctx.font = "600 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Library", C + dx, C + dz + 20);
      }

      // Village marker (usually rim-clamped: a direction indicator until near).
      {
        const [vx, , vz] = VILLAGE_CENTER;
        let dx = (vx - focus.x) * s;
        let dz = (vz - focus.z) * s;
        const dist = Math.hypot(dx, dz);
        const maxR = C - 18;
        if (dist > maxR) {
          dx = (dx / dist) * maxR;
          dz = (dz / dist) * maxR;
        }
        ctx.fillStyle = "#7fb069";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(C + dx, C + dz, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = POI_TEXT;
        ctx.font = "600 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Village", C + dx, C + dz + 20);
      }

      // Bike pin (only when on foot).
      if (!riding) {
        const bx = C + (w.bikePos.x - focus.x) * s;
        const bz = C + (w.bikePos.z - focus.z) * s;
        ctx.fillStyle = GOOGLE_RED;
        ctx.beginPath();
        ctx.arc(bx, bz, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Back to screen space for player dot + compass.
      ctx.restore();

      // Player blue dot with heading wedge (Google location style).
      ctx.save();
      ctx.translate(C, C);
      ctx.rotate(northUp ? headAngle : 0);
      ctx.fillStyle = GOOGLE_BLUE;
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(7, 4);
      ctx.lineTo(-7, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "rgba(26,115,232,0.18)";
      ctx.beginPath();
      ctx.arc(C, C, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = GOOGLE_BLUE;
      ctx.beginPath();
      ctx.arc(C, C, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // North marker (top in north-up; swings in heading-up).
      {
        const nx = C - Math.sin(headAngle) * (C - 12);
        const ny = C - Math.cos(headAngle) * (C - 12);
        ctx.fillStyle = "#5f6368";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("N", northUp ? C : nx, northUp ? 14 : ny + 3);
      }

      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [worldRef, northUp, zoomIdx]);

  return (
    <div className="absolute bottom-4 left-4 z-10 select-none">
      <div className="relative overflow-hidden rounded-2xl border border-black/10 shadow-lg">
        <canvas ref={canvasRef} style={{ width: SIZE, height: SIZE }} className="block" />
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
            onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
            className="flex h-8 w-8 items-center justify-center text-lg font-bold text-[#5f6368] hover:bg-black/5 disabled:opacity-30"
            disabled={zoomIdx === 0}
          >
            +
          </button>
          <div className="h-px bg-black/10" />
          <button
            onClick={() => setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
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
