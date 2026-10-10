// Loading scene: covers world generation (terrain heightfield slices) and
// first-frame shader compile so the player never sees a blank canvas.
// Progress 0..100 comes from buildTerrainAsync; it parks at 100 while the
// first frames present, then Game fades it out.

"use client";

const TIPS = [
  "Tip: press M for the fullscreen Tamil Nadu map",
  "Tip: hold Shift to run, Space to jump",
  "Tip: press E near the bike to ride",
  "Tip: press L for bike lights at night",
];

export default function LoadingScene({ pct }: { pct: number }) {
  const tip = TIPS[Math.min(TIPS.length - 1, Math.floor(pct / (101 / TIPS.length)))];
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-[#3f8fd2] via-[#9fd0ea] to-[#bfe3f2] select-none">
      <div className="text-4xl font-black tracking-[0.3em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
        NOMAD
      </div>
      <div className="mt-1 text-xs font-bold tracking-[0.25em] text-white/85 uppercase">
        Tamil Nadu &middot; 16 &times; 16 km
      </div>

      <div className="mt-8 h-2.5 w-64 overflow-hidden rounded-full bg-black/20 shadow-inner">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#f9ab00] to-[#e8710a] transition-[width] duration-150"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <div className="mt-2 text-sm font-bold text-white/95 tabular-nums">
        Generating world&hellip; {Math.min(100, Math.max(0, Math.round(pct)))}%
      </div>
      <div className="mt-6 animate-pulse text-xs font-semibold text-white/80">
        {tip}
      </div>
    </div>
  );
}
