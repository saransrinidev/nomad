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

const clampProgress = (pct: number) => Math.min(100, Math.max(0, pct));

export default function LoadingScene({ pct }: { pct: number }) {
  const progress = clampProgress(pct);
  const tip = TIPS[Math.min(TIPS.length - 1, Math.floor(progress / (101 / TIPS.length)))];
  return (
    <div className="absolute inset-0 z-50 overflow-hidden bg-[#101b22] text-white select-none">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(242,166,55,0.18),transparent_36%),linear-gradient(155deg,#132b35_0%,#101b22_55%,#081014_100%)]" />
      <div className="absolute -bottom-28 -left-16 h-72 w-[120%] rotate-[-6deg] border-t border-[#e8a44b]/20 bg-[#0c171c]/70 shadow-[0_-20px_80px_rgba(232,164,75,0.08)]" />
      <div className="relative flex h-full flex-col items-center justify-center px-6">
        <div className="mb-8 flex items-center gap-3 text-[10px] font-bold tracking-[0.4em] text-[#e8a44b] uppercase">
          <span className="h-px w-8 bg-[#e8a44b]/70" />
          A journey through the south
          <span className="h-px w-8 bg-[#e8a44b]/70" />
        </div>
        <div className="text-6xl font-black tracking-[0.16em] text-[#f7f2e8] drop-shadow-[0_4px_24px_rgba(0,0,0,0.4)] sm:text-7xl">
          MILEWALKER
        </div>
        <div className="mt-3 text-xs font-semibold tracking-[0.45em] text-[#b9c8c5] uppercase">
          Tamil Nadu &middot; 16 &times; 16 km
        </div>

        <div className="mt-14 w-full max-w-md">
          <div className="mb-3 flex items-end justify-between text-[11px] font-bold tracking-[0.22em] uppercase">
            <span className="text-[#b9c8c5]">Preparing your route</span>
            <span className="text-[#e8a44b] tabular-nums">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10 p-px ring-1 ring-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#d77935] via-[#e8a44b] to-[#f7d083] shadow-[0_0_18px_rgba(232,164,75,0.65)] transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2 text-sm text-[#dfe7e2]">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#e8a44b]" />
          Generating world&hellip;
        </div>
        <div className="mt-8 max-w-sm text-center text-xs font-medium leading-5 text-[#9eb1ae]">
          {tip}
        </div>
      </div>
    </div>
  );
}
