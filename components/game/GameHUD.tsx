// Minimal game HUD (DOM overlay, pointer-events-none so the canvas keeps
// all input). Re-renders only when discrete state (mode/speed) changes.

"use client";

import type { RideMode } from "@/lib/game/gameConstants";

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-7 items-center justify-center rounded-md border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">
      {children}
    </span>
  );
}

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

      {/* Bottom-left controls */}
      <div className="absolute bottom-4 left-4 space-y-1.5 rounded-xl border border-white/15 bg-black/45 px-4 py-3 text-[13px] text-white/90 backdrop-blur-sm">
        {riding ? (
          <>
            <div className="flex items-center gap-2">
              <Key>W</Key>
              <Key>A</Key>
              <Key>S</Key>
              <Key>D</Key>
              <span className="ml-1">Drive</span>
            </div>
            <div className="flex items-center gap-2">
              <Key>SPACE</Key>
              <span className="ml-1">Brake</span>
            </div>
            <div className="flex items-center gap-2">
              <Key>E</Key>
              <span className="ml-1">Exit bike</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Key>W</Key>
              <Key>A</Key>
              <Key>S</Key>
              <Key>D</Key>
              <span className="ml-1">Move</span>
            </div>
            <div className="flex items-center gap-2">
              <Key>SHIFT</Key>
              <span className="ml-1">Run</span>
            </div>
            <div className="flex items-center gap-2">
              <Key>E</Key>
              <span className="ml-1">Enter / Exit bike</span>
            </div>
          </>
        )}
        <div className="pt-1 text-[11px] text-white/50">
          Hold RIGHT MOUSE to look &middot; Scroll to zoom
        </div>
        <div className="flex items-center gap-2">
          <Key>CTRL</Key>
          <span className="ml-1">
            {camLocked ? "Cursor hidden — press again to show" : "Hide cursor"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Key>M</Key>
          <span className="ml-1">Sound on / off</span>
        </div>
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
