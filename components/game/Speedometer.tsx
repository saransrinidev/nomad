// Circular analog speedometer in the bike's palette (paint red, dark body,
// metal trim). 270° SVG dial with tick marks; the needle is driven by a
// requestAnimationFrame loop reading live bike speed (with analog-style
// damping), so it sweeps at 60fps without any React re-renders.

"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { BIKE_MAX_SPEED } from "@/lib/game/gameConstants";
import type { GameWorld } from "@/lib/game/state";

// Bike palette
const PAINT_RED = "#c23b2e";
const NEEDLE_RED = "#e0493a";
const DIAL_FACE = "#14171c";
const TRIM_METAL = "#9aa3ad";

const TOP_KMH = Math.round(BIKE_MAX_SPEED * 3.6);
const START_ANGLE = -135;
const SWEEP = 270;
const CX = 100;
const CY = 100;

function point(angleDeg: number, radius: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [CX + radius * Math.sin(a), CY - radius * Math.cos(a)];
}

function angleFor(speedKmh: number) {
  return START_ANGLE + Math.min(Math.max(speedKmh / TOP_KMH, 0), 1) * SWEEP;
}

export default function Speedometer({
  worldRef,
  speedKmh,
  visible,
}: {
  worldRef: RefObject<GameWorld>;
  speedKmh: number;
  visible: boolean;
}) {
  const needleRef = useRef<SVGGElement>(null);
  const driftRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(START_ANGLE);
  const lastRef = useRef(0);

  const ticks = useMemo(() => {
    const items: {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      major: boolean;
      label?: number;
      lx: number;
      ly: number;
    }[] = [];
    for (let v = 0; v <= TOP_KMH; v += 10) {
      const a = angleFor(v);
      const major = v % 30 === 0;
      const [x1, y1] = point(a, 88);
      const [x2, y2] = point(a, major ? 74 : 81);
      const [lx, ly] = point(a, 60);
      items.push({ x1, y1, x2, y2, major, lx, ly, label: major ? v : undefined });
    }
    return items;
  }, []);

  const redlineArc = useMemo(() => {
    const [sx, sy] = point(angleFor(TOP_KMH - 15), 83);
    const [ex, ey] = point(angleFor(TOP_KMH), 83);
    return `M ${sx.toFixed(1)} ${sy.toFixed(1)} A 83 83 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  }, []);

  // 60fps needle animation, zero React re-renders.
  useEffect(() => {
    if (!visible) return;
    angleRef.current = START_ANGLE;
    lastRef.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - lastRef.current) / 1000, 0.05);
      lastRef.current = now;
      const kmh = Math.abs(worldRef.current.bikeSpeed) * 3.6;
      const target = angleFor(kmh);
      angleRef.current += (target - angleRef.current) * Math.min(1, dt * 10);
      needleRef.current?.setAttribute(
        "transform",
        `rotate(${angleRef.current.toFixed(2)} ${CX} ${CY})`,
      );
      if (driftRef.current) {
        driftRef.current.style.opacity = worldRef.current.bikeDrift ? "1" : "0";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, worldRef]);

  if (!visible) return null;
  const redline = speedKmh > TOP_KMH - 15;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center select-none">
      <div className="relative rounded-full border border-white/15 bg-black/45 p-2 backdrop-blur-sm">
        {/* DRIFT indicator */}
        <div
          ref={driftRef}
          className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-amber-300/40 bg-amber-950/80 px-3 py-0.5 text-[11px] font-black tracking-widest text-amber-300 uppercase opacity-0 transition-opacity duration-150"
        >
          Drift
        </div>
        <svg width="208" height="208" viewBox="0 0 200 200">
          {/* Dial face + metal bezel */}
          <circle cx={CX} cy={CY} r="97" fill={DIAL_FACE} />
          <circle
            cx={CX}
            cy={CY}
            r="97"
            fill="none"
            stroke={TRIM_METAL}
            strokeOpacity="0.45"
            strokeWidth="3"
          />
          <circle
            cx={CX}
            cy={CY}
            r="91"
            fill="none"
            stroke={PAINT_RED}
            strokeOpacity="0.6"
            strokeWidth="1.5"
          />
          {/* Redline arc */}
          <path
            d={redlineArc}
            fill="none"
            stroke={NEEDLE_RED}
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Ticks + numbers */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke={
                  t.label !== undefined && t.label >= TOP_KMH - 15
                    ? NEEDLE_RED
                    : TRIM_METAL
                }
                strokeOpacity={t.major ? 0.95 : 0.55}
                strokeWidth={t.major ? 3 : 1.5}
                strokeLinecap="round"
              />
              {t.label !== undefined && (
                <text
                  x={t.lx}
                  y={t.ly + 4}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="700"
                  fill="rgba(255,255,255,0.7)"
                  fontFamily="ui-monospace, monospace"
                >
                  {t.label}
                </text>
              )}
            </g>
          ))}
          {/* Brand dot at top */}
          <circle cx={CX} cy={28} r="3" fill={PAINT_RED} />
          {/* Needle */}
          <g ref={needleRef} transform={`rotate(${START_ANGLE} ${CX} ${CY})`}>
            <line
              x1={CX}
              y1={CY + 16}
              x2={CX}
              y2={CY - 66}
              stroke={NEEDLE_RED}
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>
          <circle cx={CX} cy={CY} r="10" fill="#1c1f24" stroke={TRIM_METAL} strokeOpacity="0.6" strokeWidth="2" />
          <circle cx={CX} cy={CY} r="3" fill={PAINT_RED} />
        </svg>
        {/* Digital readout inset in the lower dial */}
        <div className="absolute inset-x-0 top-[64%] flex items-baseline justify-center gap-1.5">
          <span
            className={`text-2xl font-black tabular-nums ${
              redline ? "text-red-400" : "text-white"
            }`}
          >
            {speedKmh}
          </span>
          <span className="text-[10px] font-semibold tracking-widest text-white/60">
            KM/H
          </span>
        </div>
      </div>
    </div>
  );
}
