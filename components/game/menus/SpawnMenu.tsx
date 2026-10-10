// Testing-mode spawn picker (TAB): one tap teleports the player + bike
// to any listed place. Pure presentational menu; teleport math lives in
// Game.tsx handleSpawnPoint.

"use client";

import { SPAWN_POINTS } from "@/lib/game/gameConstants";

export default function SpawnMenu({
  onSpawn,
  onClose,
}: {
  onSpawn: (index: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm select-none">
      <div className="w-80 overflow-hidden rounded-2xl border border-white/20 bg-[#101418] shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-bold text-white">Spawn picker</div>
            <div className="text-[11px] text-white/50">
              Player + bike teleport together
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-white/60 hover:bg-white/10"
            title="Close (TAB / ESC)"
          >
            &times;
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto px-2 pb-2">
          {SPAWN_POINTS.map((p, i) => (
            <button
              key={p.name}
              onClick={() => onSpawn(i)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/10"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-sm font-black text-amber-300">
                {i + 1}
              </span>
              <span>
                <span className="block text-sm font-bold text-white">
                  {p.name}
                </span>
                <span className="block text-[11px] text-white/50">
                  {p.detail}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="border-t border-white/10 px-4 py-2 text-[11px] text-white/40">
          Click a place to spawn &middot; TAB / ESC to close
        </div>
      </div>
    </div>
  );
}
