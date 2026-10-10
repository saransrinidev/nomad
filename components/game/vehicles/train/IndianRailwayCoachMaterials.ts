// Shared materials, geometry helpers and canvas textures for the
// IndianRailways blue passenger coach. Everything is module-singleton so
// all coaches in every consist share GPU programs, materials and the
// unit geometries. Static coach parts are merged into a handful of
// vertex-colored meshes (see mergeParts) to keep draw calls low on
// integrated graphics.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** ICF blue-livery palette (natural metal, not plastic-shiny). */
export const COACH_COLORS = {
  deepBlue: "#1d4683",
  deepBlueDark: "#16345f",
  turquoise: "#2f93ad",
  turquoiseDark: "#227184",
  cream: "#e7dfc8",
  creamDark: "#cfc5a8",
  roofGrey: "#8d9094",
  roofDark: "#6f7276",
  underBlack: "#23262b",
  steel: "#9aa0a8",
  steelDark: "#4a4e55",
  railYellow: "#d8a923",
  glassDark: "#10161d",
  interiorCream: "#ded5bd",
  interiorBlue: "#28507e",
  floorBrown: "#4a4038",
  wood: "#7a5a38",
  woodDark: "#5e4429",
  rust: "#7a4a28",
  dirt: "#5d5142",
} as const;

let _mats: Record<string, THREE.MeshStandardMaterial> | null = null;

/** Singleton PBR materials shared by every coach. */
export function coachMaterials(): Record<string, THREE.MeshStandardMaterial> {
  if (_mats) return _mats;
  // Vertex-colored paint: one program for the whole merged shell. Colors
  // are baked per-box; metalness/roughness kept mid so it reads as
  // painted metal under sun, not plastic.
  const paint = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.35,
    roughness: 0.55,
  });
  // Dark hardware/undercarriage/interior fittings, also vertex-colored.
  const dark = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.55,
    roughness: 0.7,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: COACH_COLORS.glassDark,
    metalness: 0.4,
    roughness: 0.15,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
  });
  const lampWarm = new THREE.MeshStandardMaterial({
    color: "#fff6dc",
    emissive: "#ffeeb8",
    emissiveIntensity: 1.6,
  });
  const tailRed = new THREE.MeshStandardMaterial({
    color: "#7a1010",
    emissive: "#c02020",
    emissiveIntensity: 0.8,
  });
  // Cloth/skin for passengers: rough, non-metallic; colors baked per part.
  const cloth = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0,
    roughness: 0.95,
  });
  _mats = { paint, dark, glass, lampWarm, tailRed, cloth };
  return _mats;
}

let _unitBox: THREE.BoxGeometry | null = null;
/** Single shared unit box; all merged parts scale it (one GPU buffer). */
export function unitBox(): THREE.BoxGeometry {
  if (!_unitBox) _unitBox = new THREE.BoxGeometry(1, 1, 1);
  return _unitBox;
}

let _unitCyl: THREE.CylinderGeometry | null = null;
/** Shared 10-sided cylinder for bars, rails, pipes (scaled per part). */
export function unitCylinder(): THREE.CylinderGeometry {
  if (!_unitCyl) _unitCyl = new THREE.CylinderGeometry(1, 1, 1, 10);
  return _unitCyl;
}

let _unitSphere: THREE.SphereGeometry | null = null;
/** Shared low-poly sphere for heads, lamps, knobs (scaled per part). */
export function unitSphere(): THREE.SphereGeometry {
  if (!_unitSphere) _unitSphere = new THREE.SphereGeometry(1, 12, 10);
  return _unitSphere;
}

export interface PartSpec {
  /** Center position. */
  p: [number, number, number];
  /** Size (box) or [radiusTop, radiusBottom, height] (cylinder). */
  s: [number, number, number];
  /** Hex color baked as vertex color. */
  c: string;
  /** Rotation euler (radians). */
  r?: [number, number, number];
  /** Use cylinder instead of box. */
  cyl?: boolean;
  /** Use sphere instead of box (s = uniform radius via s[0]). */
  sph?: boolean;
}

const _tmpColor = new THREE.Color();
const _tmpMatrix = new THREE.Matrix4();
const _tmpPos = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpScale = new THREE.Vector3();
const _tmpEuler = new THREE.Euler();

function paintGeometry(
  geo: THREE.BufferGeometry,
  p: [number, number, number],
  s: [number, number, number],
  c: string,
  r?: [number, number, number],
): THREE.BufferGeometry {
  _tmpEuler.set(r?.[0] ?? 0, r?.[1] ?? 0, r?.[2] ?? 0);
  _tmpQuat.setFromEuler(_tmpEuler);
  _tmpPos.set(p[0], p[1], p[2]);
  _tmpScale.set(s[0], s[1], s[2]);
  _tmpMatrix.compose(_tmpPos, _tmpQuat, _tmpScale);
  geo.applyMatrix4(_tmpMatrix);
  _tmpColor.set(c);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = _tmpColor.r;
    colors[i * 3 + 1] = _tmpColor.g;
    colors[i * 3 + 2] = _tmpColor.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  // Drop UVs/normals mismatch risk: keep normals, drop uvs (unneeded).
  geo.deleteAttribute("uv");
  return geo;
}

/**
 * Merge many colored box/cylinder parts into ONE geometry (one draw call).
 * Parts must all be boxes or all cylinders? Mixed is fine — both are
 * non-indexed... actually both ARE indexed with same attributes
 * (position/normal/color after uv delete), so mergeGeometries works.
 */
export function mergeParts(parts: PartSpec[]): THREE.BufferGeometry {
  const geos = parts.map((part) => {
    const base = part.sph ? unitSphere() : part.cyl ? unitCylinder() : unitBox();
    const size: [number, number, number] = part.sph
      ? [part.s[0], part.s[0], part.s[0]]
      : part.s;
    const g = base.clone();
    return paintGeometry(g, part.p, size, part.c, part.r);
  });
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) throw new Error("mergeParts: geometry merge failed");
  return merged;
}

// --- Canvas textures (procedural, no external assets) ---

const texCache = new Map<string, THREE.CanvasTexture | null>();

/** Side lettering board: coach number + SWR + SOUTH WESTERN RAILWAY. */
export function sideLetteringTexture(coachNumber: string): THREE.CanvasTexture | null {
  const key = `side:${coachNumber}`;
  if (texCache.has(key)) return texCache.get(key)!;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 1024, 128);
  ctx.fillStyle = "#f2ecd8";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = "700 64px Arial, sans-serif";
  ctx.fillText(coachNumber, 30, 52);
  ctx.font = "700 44px Arial, sans-serif";
  ctx.fillText("SWR", 330, 50);
  ctx.font = "600 34px Arial, sans-serif";
  ctx.fillText("SOUTH WESTERN RAILWAY", 480, 52);
  ctx.fillStyle = "#f2ecd8";
  ctx.fillRect(30, 94, 964, 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

/** Rounded-corner dark window glass (alpha corners fake the radius). */
export function windowGlassTexture(): THREE.CanvasTexture | null {
  const key = "glass:rounded";
  if (texCache.has(key)) return texCache.get(key)!;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 112;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 112);
  const r = 22;
  ctx.fillStyle = "rgba(16,22,29,1)";
  ctx.beginPath();
  ctx.roundRect(0, 0, 128, 112, r);
  ctx.fill();
  // Faint diagonal reflection streak so glass reads as glass, not void.
  ctx.fillStyle = "rgba(150,180,200,0.16)";
  ctx.beginPath();
  ctx.moveTo(20, 112);
  ctx.lineTo(70, 0);
  ctx.lineTo(95, 0);
  ctx.lineTo(45, 112);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

/** Transparent grime blotches for lower-body weathering decals. */
export function grimeTexture(seed: number): THREE.CanvasTexture | null {
  const key = `grime:${seed}`;
  if (texCache.has(key)) return texCache.get(key)!;
  if (typeof document === "undefined") return null;
  let s = seed * 1000 + 7;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 128);
  for (let i = 0; i < 60; i++) {
    const x = rand() * 256;
    const y = 60 + rand() * 68;
    const w = 8 + rand() * 40;
    const h = 4 + rand() * 14;
    ctx.fillStyle = `rgba(70,58,40,${0.05 + rand() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Rust weeps (vertical streaks).
  for (let i = 0; i < 12; i++) {
    const x = rand() * 256;
    const y = rand() * 50;
    const h = 20 + rand() * 60;
    ctx.fillStyle = `rgba(122,74,40,${0.10 + rand() * 0.15})`;
    ctx.fillRect(x, y, 2 + rand() * 3, h);
  }
  // Faded paint patches.
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = `rgba(200,200,190,${0.04 + rand() * 0.06})`;
    ctx.fillRect(rand() * 256, rand() * 128, 20 + rand() * 50, 10 + rand() * 30);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}
