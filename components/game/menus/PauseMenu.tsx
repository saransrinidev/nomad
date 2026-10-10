// ESC/P pause menu: Resume, expandable Controls reference, Sound toggle,
// Graphics quality, Respawn. Rendered above everything with its own pointer
// events while the 3D scene stays frozen behind a blur overlay.

"use client";

import { useState } from "react";
import type { QualityMode } from "@/lib/game/quality";

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-7 items-center justify-center rounded-md border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">
      {children}
    </span>
  );
}

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-white/90">
      {keys.map((k) => (
        <Key key={k}>{k}</Key>
      ))}
      <span className="ml-1">{label}</span>
    </div>
  );
}

function MenuButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
    >
      {children}
    </button>
  );
}

export default function PauseMenu({
  onResume,
  muted,
  onToggleMute,
  onRespawn,
  mapNorthUp,
  onToggleMap,
  qualityMode,
  onQualityMode,
}: {
  onResume: () => void;
  muted: boolean;
  onToggleMute: () => void;
  onRespawn: () => void;
  mapNorthUp: boolean;
  onToggleMap: () => void;
  qualityMode: QualityMode;
  onQualityMode: (m: QualityMode) => void;
}) {
  const [showControls, setShowControls] = useState(false);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm select-none">
      <div className="w-72 rounded-2xl border border-white/15 bg-black/70 p-5 shadow-2xl">
        <h2 className="mb-1 text-center text-xl font-black tracking-widest text-white">
          PAUSED
        </h2>
        <p className="mb-4 text-center text-[11px] text-white/50">
          ESC / P to resume
        </p>
        <div className="space-y-2">
          <MenuButton onClick={onResume}>Resume</MenuButton>
          <MenuButton onClick={() => setShowControls((v) => !v)}>
            {showControls ? "Hide controls" : "Controls"}
          </MenuButton>
          {showControls && (
            <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
              <div className="text-[11px] font-bold tracking-widest text-white/50">
                ON FOOT
              </div>
              <Row keys={["W", "A", "S", "D"]} label="Move" />
              <Row keys={["SHIFT"]} label="Run" />
              <Row keys={["E"]} label="Enter bike" />
              <div className="pt-1 text-[11px] font-bold tracking-widest text-white/50">
                ON BIKE
              </div>
              <Row keys={["W", "A", "S", "D"]} label="Drive" />
              <Row keys={["SPACE"]} label="Brake" />
              <Row keys={["E"]} label="Exit bike" />
              <Row keys={["X"]} label="Start / stop engine" />
              <Row keys={["L"]} label="Headlight on / off" />
              <div className="pt-1 text-[11px] font-bold tracking-widest text-white/50">
                CAMERA
              </div>
              <Row keys={["HOLD", "R-MOUSE"]} label="Look around" />
              <Row keys={["SCROLL"]} label="Zoom" />
              <Row keys={["CTRL"]} label="Hide cursor" />
              <div className="pt-1 text-[11px] font-bold tracking-widest text-white/50">
                GENERAL
              </div>
              <Row keys={["ESC", "P"]} label="Pause menu" />
              <Row keys={["M"]} label="Open / close map" />
              <Row keys={["N"]} label="Sound on / off" />
              <div className="pt-1 text-[11px] font-bold tracking-widest text-white/50">
                MINIMAP
              </div>
              <MenuButton onClick={onToggleMap}>
                Map: {mapNorthUp ? "North-up" : "Heading-up"}
              </MenuButton>
            </div>
          )}
          <MenuButton onClick={onToggleMute}>
            {muted ? "Unmute sound" : "Mute sound"}
          </MenuButton>
          <div>
            <div className="mb-1.5 text-center text-[11px] font-bold tracking-widest text-white/50">
              GRAPHICS {qualityMode === "auto" ? "(AUTO)" : ""}
            </div>
            <div className="flex gap-1.5">
              {(["auto", "high", "low"] as QualityMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => onQualityMode(m)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-xs font-bold tracking-wide uppercase transition-colors ${
                    qualityMode === m
                      ? "border-amber-300/60 bg-amber-400/90 text-black"
                      : "border-white/15 bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-center text-[11px] leading-snug text-white/45">
              Low turns off shadows &amp; extra pixels. Auto steps down if the
              frame rate drops.
            </p>
          </div>
          <MenuButton onClick={onRespawn}>Respawn</MenuButton>
        </div>
      </div>
    </div>
  );
}
