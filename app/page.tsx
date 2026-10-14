"use client";

import dynamic from "next/dynamic";

const Game = dynamic(() => import("@/components/game/Game"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh w-full flex-col items-center justify-center bg-[#101b22] text-white">
      <p className="text-4xl font-black tracking-[0.18em] text-[#f7f2e8]">MILEWALKER</p>
      <p className="mt-3 animate-pulse text-[10px] font-bold tracking-[0.35em] text-[#e8a44b] uppercase">
        Preparing your route
      </p>
    </div>
  ),
});

export default function Home() {
  return (
    <main className="h-dvh w-full">
      <Game />
    </main>
  );
}
