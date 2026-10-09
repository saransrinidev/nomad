// Live lat/long readout (bottom-right). Updates ~5Hz via rAF writing to a
// text node directly — zero React re-renders. Follows the bike when riding.

"use client";

import { useEffect, useRef, type RefObject } from "react";
import { formatLatLong, metersToLatLong } from "@/lib/game/map/geo";
import { getFocusPoint, type GameWorld } from "@/lib/game/state";

export default function GeoReadout({ worldRef }: { worldRef: RefObject<GameWorld> }) {
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 200) return;
      last = now;
      const el = textRef.current;
      if (!el) return;
      const f = getFocusPoint(worldRef.current);
      const { lat, lon } = metersToLatLong(f.x, f.z);
      const s = formatLatLong(lat, lon);
      if (el.textContent !== s) el.textContent = s;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [worldRef]);

  return (
    <div className="pointer-events-none absolute right-4 bottom-4 z-10 select-none">
      <div className="rounded-xl border border-white/15 bg-black/45 px-4 py-2.5 backdrop-blur-sm">
        <span
          ref={textRef}
          className="font-mono text-[12px] font-semibold tracking-wider text-white/85"
        >
          …
        </span>
      </div>
    </div>
  );
}
