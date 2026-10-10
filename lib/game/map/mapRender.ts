// Shared Google-style map renderer (canvas 2D, framework-free).
// Used by both the corner minimap and the fullscreen BigMap: ocean
// background, Tamil Nadu outline fill, district divisions + names,
// bike pin, orange player arrow, compass N. All positions are read live
// every animation frame so trains + player are true real-time data.

import { CHUNK_SIZE, WORLD_HALF } from "@/lib/game/map/terrain";
import { getTNGameOutline } from "@/lib/game/map/tamilnadu";
import type { RailwayMapData } from "@/lib/game/map/railway";

export const MAP_LAND = "#b3e0ae";
export const MAP_OCEAN = "#a8d8f0";
const GOOGLE_RED = "#ea4335";
const LABEL_TEXT = "#5f6368";
// Live player marker: bright orange nav arrow (white-ringed so it reads on
// green land, blue rail lines and amber highlight at any zoom).
const PLAYER_ORANGE = "#ff7a00";
const PLAYER_ORANGE_DARK = "#e65100";

export interface MapSnapshot {
  focusX: number;
  focusZ: number;
  /** Actual player position (may differ from focus when the map is panned). */
  px: number;
  pz: number;
  yaw: number;
  riding: boolean;
  bikeX: number;
  bikeZ: number;
  northUp: boolean;
}

export interface MapDrawOptions {
  /** 500 m gridlines (big map). */
  grid?: boolean;
  /** District boundary rings in game meters (exact GeoJSON or fallback). */
  districtRings?: { x: number; z: number }[][];
  /** District name anchors in game meters. */
  districtLabels?: { name: string; x: number; z: number }[];
  /** Canvas font for district labels. */
  labelFont?: string;
  /** Railway line + stations + live train marker. */
  railway?: RailwayMapData;
  /** Thanjavur highlight rings in game meters (drawn filled + colored). */
  highlightRings?: { x: number; z: number }[][];
  /** Thanjavur label anchor in game meters. */
  highlightLabel?: { name: string; x: number; z: number } | null;
  /** Fill / stroke for the highlight (defaults to warm amber). */
  highlightFill?: string;
  highlightStroke?: string;
}

/** Screen-space heading of the player marker (shared by renderer + pan math). */
export function headingAngle(yaw: number): number {
  return Math.atan2(Math.sin(yaw), -Math.cos(yaw));
}

export function renderMap(
  ctx: CanvasRenderingContext2D,
  size: number,
  range: number,
  snap: MapSnapshot,
  opts: MapDrawOptions = {},
): void {
  const s = size / (range * 2); // px per meter
  const C = size / 2;
  const headAngle = headingAngle(snap.yaw);

  // Ocean background, then Tamil Nadu on top (both rotate together).
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = MAP_OCEAN;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.clip();

  // In heading-up mode, rotate the world so travel direction is up.
  ctx.save();
  ctx.translate(C, C);
  if (!snap.northUp) ctx.rotate(-headAngle);
  ctx.translate(-C, -C);

  const toMap = (x: number, z: number): [number, number] => [
    C + (x - snap.focusX) * s,
    C + (z - snap.focusZ) * s,
  ];

  // Tamil Nadu polygon.
  const traceTN = () => {
    const outline = getTNGameOutline();
    ctx.beginPath();
    for (let i = 0; i < outline.length; i++) {
      const [mx, mz] = toMap(outline[i].x, outline[i].z);
      if (i === 0) ctx.moveTo(mx, mz);
      else ctx.lineTo(mx, mz);
    }
    ctx.closePath();
  };
  {
    traceTN();
    ctx.fillStyle = MAP_LAND;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // District divisions, clipped to the land so fallback box corners never
  // draw lines out over the ocean.
  if (opts.districtRings && opts.districtRings.length > 0) {
    ctx.save();
    traceTN();
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 1;
    for (const ring of opts.districtRings) {
      ctx.beginPath();
      for (let i = 0; i < ring.length; i++) {
        const [mx, mz] = toMap(ring[i].x, ring[i].z);
        if (i === 0) ctx.moveTo(mx, mz);
        else ctx.lineTo(mx, mz);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  // District names for divisions in view.
  if (opts.districtLabels && opts.districtLabels.length > 0) {
    ctx.font = opts.labelFont ?? "600 9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const L of opts.districtLabels) {
      // Skip the highlighted district here — it gets its own pill label below.
      if (opts.highlightLabel && L.name.toLowerCase() === opts.highlightLabel.name.toLowerCase()) {
        const same =
          Math.abs(L.x - opts.highlightLabel.x) < 1 && Math.abs(L.z - opts.highlightLabel.z) < 1;
        if (same) continue;
      }
      const [mx, mz] = toMap(L.x, L.z);
      if (mx < 28 || mx > size - 28 || mz < 16 || mz > size - 16) continue;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.strokeText(L.name, mx, mz);
      ctx.fillStyle = LABEL_TEXT;
      ctx.fillText(L.name, mx, mz);
    }
    ctx.textBaseline = "alphabetic";
  }

  // Thanjavur highlight: colored fill + bold border, clipped to the land.
  if (opts.highlightRings && opts.highlightRings.length > 0) {
    const fill = opts.highlightFill ?? "rgba(249,171,0,0.38)";
    const stroke = opts.highlightStroke ?? "#e8710a";
    ctx.save();
    traceTN();
    ctx.clip();
    for (const ring of opts.highlightRings) {
      ctx.beginPath();
      for (let i = 0; i < ring.length; i++) {
        const [mx, mz] = toMap(ring[i].x, ring[i].z);
        if (i === 0) ctx.moveTo(mx, mz);
        else ctx.lineTo(mx, mz);
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.5;
      // Crisp border at any zoom + soft outer glow so it reads on green.
      ctx.shadowColor = "rgba(232,113,10,0.55)";
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Inner hairline for a clean cartographic edge.
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    // Pill label so Thanjavur reads even when zoomed out.
    if (opts.highlightLabel) {
      const [lx, ly] = toMap(opts.highlightLabel.x, opts.highlightLabel.z);
      if (lx > 40 && lx < size - 40 && ly > 20 && ly < size - 20) {
        ctx.font = "800 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const w = ctx.measureText(opts.highlightLabel.name).width + 18;
        const h = 20;
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(lx - w / 2, ly - h / 2, w, h, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#b06000";
        ctx.fillText(opts.highlightLabel.name, lx, ly + 0.5);
        ctx.textBaseline = "alphabetic";
      }
    }
  }

  // 1000 m grid (big map), with bolder lines on 4 km chunk boundaries.
  if (opts.grid) {
    for (let gx = -WORLD_HALF; gx <= WORLD_HALF; gx += 1000) {
      const major = (gx + WORLD_HALF) % CHUNK_SIZE === 0;
      ctx.strokeStyle = major ? "rgba(0,0,0,0.22)" : "rgba(0,0,0,0.09)";
      ctx.lineWidth = major ? 2 : 1;
      const [ax] = toMap(gx, 0);
      ctx.beginPath();
      ctx.moveTo(ax, 0);
      ctx.lineTo(ax, size);
      ctx.stroke();
    }
    for (let gz = -WORLD_HALF; gz <= WORLD_HALF; gz += 1000) {
      const major = (gz + WORLD_HALF) % CHUNK_SIZE === 0;
      ctx.strokeStyle = major ? "rgba(0,0,0,0.22)" : "rgba(0,0,0,0.09)";
      ctx.lineWidth = major ? 2 : 1;
      const [, bz] = toMap(0, gz);
      ctx.beginPath();
      ctx.moveTo(0, bz);
      ctx.lineTo(size, bz);
      ctx.stroke();
    }
  }

  // Railway: every line, its stations + names, and live train markers.
  if (opts.railway) {
    const rw = opts.railway;
    // Station name anchors already labeled (screen px) + names already
    // shown: shared junctions (Chennai, Villupuram, Trichy) keep one
    // label instead of muddy overprinting, even when their platform
    // faces are staggered apart.
    const labeled: [number, number][] = [];
    const named = new Set<string>();
    for (const line of rw.lines) {
      if (line.path.length > 1) {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i < line.path.length; i++) {
          const [mx, mz] = toMap(line.path[i].x, line.path[i].z);
          if (i === 0) ctx.moveTo(mx, mz);
          else ctx.lineTo(mx, mz);
        }
        ctx.stroke();
      }
      ctx.font = "700 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const st of line.stations) {
        const [mx, mz] = toMap(st.x, st.z);
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(mx - 4, mz - 4, 8, 8);
        ctx.fill();
        ctx.stroke();
        const lx = mx;
        const ly = mz + 14;
        if (named.has(st.name)) continue;
        if (labeled.some(([px, pz]) => Math.hypot(px - lx, pz - ly) < 14)) continue;
        labeled.push([lx, ly]);
        named.add(st.name);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.strokeText(st.name, lx, ly);
        ctx.fillStyle = LABEL_TEXT;
        ctx.fillText(st.name, lx, ly);
      }
      ctx.textBaseline = "alphabetic";
    }
    for (const tr of rw.trains) {
      const [tx, tz] = toMap(tr.x, tr.z);
      ctx.fillStyle = "#c0392b";
      ctx.beginPath();
      ctx.arc(tx, tz, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Bike pin (only when on foot).
  if (!snap.riding) {
    const [bx, bz] = toMap(snap.bikeX, snap.bikeZ);
    ctx.fillStyle = GOOGLE_RED;
    ctx.beginPath();
    ctx.arc(bx, bz, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Back to screen space for player dot.
  ctx.restore();

  // Player position in screen space (differs from center when panned).
  // The world layer is rotated by -headAngle only in heading-up mode, so
  // un-rotate the offset only then; in north-up mode the offset is direct.
  const relX = (snap.px - snap.focusX) * s;
  const relZ = (snap.pz - snap.focusZ) * s;
  const ra = snap.northUp ? 0 : headAngle;
  const ca = Math.cos(ra);
  const sa = Math.sin(ra);
  const dotX = C + ca * relX + sa * relZ;
  const dotZ = C + -sa * relX + ca * relZ;
  const MARGIN = 24;
  const dotVisible =
    dotX > MARGIN && dotX < size - MARGIN && dotZ > MARGIN && dotZ < size - MARGIN;

  if (dotVisible) {
    // Real-time player arrow: orange navigation chevron pointing along the
    // live heading (playerYaw on foot, bikeYaw while riding). Rotated every
    // frame in north-up mode; already up in heading-up mode.
    ctx.save();
    ctx.translate(dotX, dotZ);
    ctx.rotate(snap.northUp ? headAngle : 0);
    // Soft halo so the arrow pops over rails / district borders.
    ctx.fillStyle = "rgba(255,122,0,0.22)";
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    // Arrow body: pointed nose + notched tail (maps-style).
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(9, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-9, 8);
    ctx.closePath();
    ctx.fillStyle = PLAYER_ORANGE;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();
    // Inner shading wedge for depth.
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(0, 4);
    ctx.lineTo(-9, 8);
    ctx.closePath();
    ctx.fillStyle = PLAYER_ORANGE_DARK;
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  } else {
    // Off-screen edge marker pointing toward the player (orange).
    const dx = dotX - C;
    const dz = dotZ - C;
    const len = Math.max(1, Math.hypot(dx, dz));
    const ex = C + (dx / len) * (C - MARGIN);
    const ez = C + (dz / len) * (C - MARGIN);
    ctx.save();
    ctx.translate(ex, ez);
    ctx.rotate(Math.atan2(dz, dx) + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 6);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-7, 6);
    ctx.closePath();
    ctx.fillStyle = PLAYER_ORANGE;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = PLAYER_ORANGE;
    ctx.beginPath();
    ctx.arc(ex, ez, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // North marker.
  {
    const nx = C - Math.sin(headAngle) * (C - 12);
    const ny = C - Math.cos(headAngle) * (C - 12);
    ctx.fillStyle = "#5f6368";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N", snap.northUp ? C : nx, snap.northUp ? 14 : ny + 3);
  }

  ctx.restore();
}
