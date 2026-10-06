// Minimal game HUD (DOM overlay, pointer-events-none so the canvas keeps
// all input). Re-renders only when discrete state changes. The full controls
// reference lives in the ESC pause menu; the minimap occupies bottom-left.

"use client";

import type { RideMode } from "@/lib/game/gameConstants";

export default function GameHUD({
  mode,
  speedKmh,
  camLocked,
  muted,
}: {
  mode: RideMode;
  speedKmh: number;
  camLocked: boolean;
  muted: boolean;
}) {
  const riding = mode === "ride";
  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* Top-left player badge */}
      <div className="absolute top-4 left-4 rounded-xl border border-white/15 bg-black/45 px-4 py-2.5 backdrop-blur-sm">
        <div className="text-[11px] font-medium tracking-[0.2em] text-white/60">
          {riding ? "BIKE" : "PLAYER"}
        </div>
        <div className="text-lg leading-tight font-bold text-white">
          {riding ? `${speedKmh} km/h` : "On foot"}
        </div>
      </div>

      {/* Bottom hint next to the minimap (full list is in the ESC menu) */}
      <div className="absolute bottom-4 left-56 rounded-xl border border-white/15 bg-black/45 px-4 py-2.5 text-[12px] text-white/80 backdrop-blur-sm">
        E <span className="text-white/50">{riding ? "exit" : "ride"}</span>
        <span className="mx-2 text-white/25">|</span>
        ESC <span className="text-white/50">menu</span>
      </div>

      {/* Top-right muted badge */}
      {muted && (
        <div className="absolute top-4 right-4 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[11px] font-semibold tracking-widest text-white/70 uppercase backdrop-blur-sm">
          Muted
        </div>
      )}

      {/* Top-center mouse-look badge */}
      {camLocked && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full border border-emerald-300/30 bg-emerald-950/60 px-4 py-1.5 text-xs font-semibold tracking-widest text-emerald-200 uppercase backdrop-blur-sm">
          Mouse-look &middot; CTRL to release cursor
        </div>
      )}
    </div>
  );
}
