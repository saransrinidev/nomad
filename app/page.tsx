"use client";

import dynamic from "next/dynamic";

const Game = dynamic(() => import("@/components/game/Game"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh w-full items-center justify-center bg-[#bfe3f2]">
      <p className="animate-pulse text-sm font-semibold tracking-widest text-slate-700 uppercase">
        Loading world…
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
