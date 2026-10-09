// Map editor panel: left tool palette, right inspector (tile / meters /
// lat-long cursor readout via rAF text writes, brush sliders, paint layers).
// Renders only in editor mode; panels take pointer events, gaps let clicks
// through to the canvas.

"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  PAINT_COLORS,
  tileIdFor,
  type EditorRuntime,
  type EditorTool,
  type PaintLayer,
} from "@/lib/game/map/terrain";
import { formatLatLong, metersToLatLong } from "@/lib/game/map/geo";

const TOOLS: { id: EditorTool; label: string }[] = [
  { id: "raise", label: "Raise" },
  { id: "lower", label: "Lower" },
  { id: "flatten", label: "Flatten" },
  { id: "smooth", label: "Smooth" },
  { id: "paint", label: "Paint" },
];

const LAYER_NAMES = ["Grass", "Dirt", "Sand", "Rock", "Asphalt"];

function CursorReadout({ editorRef }: { editorRef: RefObject<EditorRuntime> }) {
  const tileRef = useRef<HTMLSpanElement>(null);
  const posRef = useRef<HTMLSpanElement>(null);
  const geoRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 150) return;
      last = now;
      const ed = editorRef.current;
      if (!ed.cursorValid) {
        if (tileRef.current && tileRef.current.textContent !== "—") {
          tileRef.current.textContent = "—";
          if (posRef.current) posRef.current.textContent = "—";
          if (geoRef.current) geoRef.current.textContent = "—";
        }
        return;
      }
      const t = tileIdFor(ed.cursorX, ed.cursorZ);
      const m = `${Math.round(ed.cursorX)}, ${Math.round(ed.cursorZ)} m`;
      const { lat, lon } = metersToLatLong(ed.cursorX, ed.cursorZ);
      const g = formatLatLong(lat, lon);
      if (tileRef.current && tileRef.current.textContent !== t) tileRef.current.textContent = t;
      if (posRef.current && posRef.current.textContent !== m) posRef.current.textContent = m;
      if (geoRef.current && geoRef.current.textContent !== g) geoRef.current.textContent = g;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [editorRef]);

  return (
    <div className="space-y-1 font-mono text-[12px] text-white/85">
      <div className="flex justify-between">
        <span className="text-white/50">Tile</span>
        <span ref={tileRef}>—</span>
      </div>
      <div className="flex justify-between">
        <span className="text-white/50">Meters</span>
        <span ref={posRef}>—</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-white/50">LatLong</span>
        <span ref={geoRef}>—</span>
      </div>
    </div>
  );
}

export default function EditorPanel({
  editorRef,
  onExit,
}: {
  editorRef: RefObject<EditorRuntime>;
  onExit: () => void;
}) {
  const [tool, setTool] = useState<EditorTool>("raise");
  const [brushRadius, setBrushRadius] = useState(120);
  const [strength, setStrength] = useState(12);
  const [paintLayer, setPaintLayer] = useState<PaintLayer>(1);

  // Adopt the shared runtime values on mount (panel opens fresh each time).
  useEffect(() => {
    const ed = editorRef.current;
    setTool(ed.tool);
    setBrushRadius(ed.brushRadius);
    setStrength(ed.strength);
    setPaintLayer(ed.paintLayer);
  }, [editorRef]);

  const sync = (patch: Partial<EditorRuntime>) => {
    Object.assign(editorRef.current, patch);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      {/* Top-center mode badge */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full border border-amber-300/40 bg-amber-950/70 px-4 py-1.5 text-xs font-bold tracking-widest text-amber-200 uppercase backdrop-blur-sm">
        Map editor &middot; F2 / ESC to exit
      </div>

      {/* Left tool palette */}
      <div className="pointer-events-auto absolute top-1/2 left-4 flex -translate-y-1/2 flex-col gap-1.5 rounded-xl border border-white/15 bg-black/60 p-2 backdrop-blur-sm">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTool(t.id);
              sync({ tool: t.id });
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tool === t.id
                ? "bg-amber-400 text-black"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={onExit}
          className="mt-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/15"
        >
          Done
        </button>
      </div>

      {/* Right inspector */}
      <div className="pointer-events-auto absolute top-1/2 right-4 w-60 -translate-y-1/2 space-y-4 rounded-xl border border-white/15 bg-black/60 p-4 backdrop-blur-sm">
        <div>
          <div className="mb-2 text-[11px] font-bold tracking-widest text-white/50 uppercase">
            Cursor
          </div>
          <CursorReadout editorRef={editorRef} />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[11px] font-bold tracking-widest text-white/50 uppercase">
            <span>Brush</span>
            <span className="font-mono text-white/80">{Math.round(brushRadius)} m</span>
          </div>
          <input
            type="range"
            min={20}
            max={400}
            step={10}
            value={brushRadius}
            onChange={(e) => {
              const v = Number(e.target.value);
              setBrushRadius(v);
              sync({ brushRadius: v });
            }}
            className="w-full"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[11px] font-bold tracking-widest text-white/50 uppercase">
            <span>Strength</span>
            <span className="font-mono text-white/80">{strength} m/s</span>
          </div>
          <input
            type="range"
            min={2}
            max={30}
            step={1}
            value={strength}
            onChange={(e) => {
              const v = Number(e.target.value);
              setStrength(v);
              sync({ strength: v });
            }}
            className="w-full"
          />
        </div>
        <div>
          <div className="mb-2 text-[11px] font-bold tracking-widest text-white/50 uppercase">
            Paint layer
          </div>
          <div className="flex gap-1.5">
            {PAINT_COLORS.map((c, i) => (
              <button
                key={c}
                title={LAYER_NAMES[i]}
                onClick={() => {
                  const v = i as PaintLayer;
                  setPaintLayer(v);
                  sync({ paintLayer: v, tool: "paint" });
                  setTool("paint");
                }}
                className={`h-8 w-8 rounded-md border-2 transition-transform hover:scale-110 ${
                  paintLayer === i && tool === "paint" ? "border-amber-300" : "border-white/20"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-white/45">
          LMB paints &middot; wheel zooms &middot; WASD pans. 1 tile = 1 km.
        </p>
      </div>
    </div>
  );
}
