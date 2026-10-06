// Shared Google-style map renderer (canvas 2D, framework-free).
// Used by both the corner minimap and the fullscreen BigMap: green terrain,
// blue water, POI markers, bike pin, blue-dot player, compass N.

import { VILLAGE_CENTER } from "@/lib/game/map/village";
import {
  LAKE,
  OCEAN,
  POND,
  RIVER_POINTS,
  RIVER_WIDTH,
  VILLAGE_POND,
} from "@/lib/game/map/water";
import { WORLD_HALF } from "@/lib/game/map/terrain";

export const MAP_LAND = "#b3e0ae";
export const MAP_WATER = "#aad3df";
const POI_TEXT = "#5f6368";
const GOOGLE_BLUE = "#1a73e8";
const GOOGLE_RED = "#ea4335";

export interface MapSnapshot {
  focusX: number;
  focusZ: number;
  yaw: number;
  riding: boolean;
  bikeX: number;
  bikeZ: number;
  northUp: boolean;
}

export interface MapDrawOptions {
  /** 100 m gridlines + island border (big map). */
  grid?: boolean;
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
  const headAngle = Math.atan2(Math.sin(snap.yaw), -Math.cos(snap.yaw));

  // Ocean background, then the green island on top (both rotate together).
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = MAP_WATER;
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

  {
    const [ix0, iz0] = toMap(-WORLD_HALF, -WORLD_HALF);
    ctx.fillStyle = MAP_LAND;
    ctx.fillRect(ix0, iz0, WORLD_HALF * 2 * s, WORLD_HALF * 2 * s);
  }

  // 100 m grid (big map).
  if (opts.grid) {
    ctx.strokeStyle = "rgba(0,0,0,0.09)";
    ctx.lineWidth = 1;
    for (let gx = -WORLD_HALF; gx <= WORLD_HALF; gx += 100) {
      const [ax] = toMap(gx, 0);
      ctx.beginPath();
      ctx.moveTo(ax, 0);
      ctx.lineTo(ax, size);
      ctx.stroke();
    }
    for (let gz = -WORLD_HALF; gz <= WORLD_HALF; gz += 100) {
      const [, bz] = toMap(0, gz);
      ctx.beginPath();
      ctx.moveTo(0, bz);
      ctx.lineTo(size, bz);
      ctx.stroke();
    }
    // Island border.
    const [bx0, bz0] = toMap(-WORLD_HALF, -WORLD_HALF);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx0, bz0, WORLD_HALF * 2 * s, WORLD_HALF * 2 * s);
  }

  // Water bodies.
  ctx.fillStyle = MAP_WATER;
  for (const p of [POND, LAKE, VILLAGE_POND]) {
    const [mx, mz] = toMap(p.x, p.z);
    ctx.beginPath();
    ctx.arc(mx, mz, Math.max(2, p.r * s), 0, Math.PI * 2);
    ctx.fill();
  }
  {
    const [ox, oz] = toMap(OCEAN.minX, OCEAN.minZ);
    ctx.fillRect(ox, oz, (OCEAN.maxX - OCEAN.minX) * s, (OCEAN.maxZ - OCEAN.minZ) * s);
  }
  // River.
  ctx.strokeStyle = MAP_WATER;
  ctx.lineWidth = Math.max(1.5, RIVER_WIDTH * s);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  RIVER_POINTS.forEach(([px, pz], i) => {
    const [mx, mz] = toMap(px, pz);
    if (i === 0) ctx.moveTo(mx, mz);
    else ctx.lineTo(mx, mz);
  });
  ctx.stroke();

  // Village marker (only when in view).
  {
    const [vx, , vz] = VILLAGE_CENTER;
    const [mx, mz] = toMap(vx, vz);
    if (Math.hypot(mx - C, mz - C) <= C - 18) {
      ctx.fillStyle = "#7fb069";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, mz, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = POI_TEXT;
      ctx.font = "600 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Village", mx, mz + 20);
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

  // Player blue dot with heading wedge.
  ctx.save();
  ctx.translate(C, C);
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
  ctx.arc(C, C, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = GOOGLE_BLUE;
  ctx.beginPath();
  ctx.arc(C, C, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.stroke();

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
