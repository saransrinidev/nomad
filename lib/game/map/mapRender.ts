// Shared Google-style map renderer (canvas 2D, framework-free).
// Used by both the corner minimap and the fullscreen BigMap: ocean
// background, Tamil Nadu outline fill, district divisions + names,
// bike pin, blue-dot player, compass N.

import { CHUNK_SIZE, WORLD_HALF } from "@/lib/game/map/terrain";
import { getTNGameOutline } from "@/lib/game/map/tamilnadu";
import type { RailwayMapData } from "@/lib/game/map/railway";

export const MAP_LAND = "#b3e0ae";
export const MAP_OCEAN = "#a8d8f0";
const GOOGLE_BLUE = "#1a73e8";
const GOOGLE_RED = "#ea4335";
const LABEL_TEXT = "#5f6368";

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
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.strokeText(st.name, mx, mz + 14);
        ctx.fillStyle = LABEL_TEXT;
        ctx.fillText(st.name, mx, mz + 14);
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
    // Player blue dot with heading wedge.
    ctx.save();
    ctx.translate(dotX, dotZ);
    ctx.rotate(snap.northUp ? headAngle : 0);
    ctx.fillStyle = GOOGLE_BLUE;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(7, 4);
    ctx.lineTo(-7, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(26,115,232,0.18)";
    ctx.beginPath();
    ctx.arc(dotX, dotZ, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = GOOGLE_BLUE;
    ctx.beginPath();
    ctx.arc(dotX, dotZ, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.stroke();
  } else {
    // Off-screen edge marker pointing toward the player.
    const dx = dotX - C;
    const dz = dotZ - C;
    const len = Math.max(1, Math.hypot(dx, dz));
    const ex = C + (dx / len) * (C - MARGIN);
    const ez = C + (dz / len) * (C - MARGIN);
    ctx.save();
    ctx.translate(ex, ez);
    ctx.rotate(Math.atan2(dz, dx) + Math.PI / 2);
    ctx.fillStyle = GOOGLE_BLUE;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(6, 5);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = GOOGLE_BLUE;
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
