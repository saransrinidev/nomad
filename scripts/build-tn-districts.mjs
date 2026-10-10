// Builds public/maps/tn-districts.geojson from the open 38-district source.
// Simplifies rings (Douglas-Peucker) + normalizes names to the canonical
// 38 used by the game fallback boxes. Run: node scripts/build-tn-districts.mjs
// Source: https://github.com/datta07/INDIAN-SHAPEFILES (WGS84, EPSG:4326)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC =
  "https://raw.githubusercontent.com/datta07/INDIAN-SHAPEFILES/master/STATES/TAMIL%20NADU/TAMIL%20NADU_DISTRICTS.geojson";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "maps", "tn-districts.geojson");

// Canonical game names (must match FALLBACK_DISTRICTS in districts.ts).
const ALIAS = new Map(
  Object.entries({
    kanniyakumari: "Kanyakumari",
    "the nilgiris": "Nilgiris",
    nilgiris: "Nilgiris",
    tuticorin: "Thoothukkudi",
    thoothukudi: "Thoothukkudi",
    villupuram: "Viluppuram",
    kanchipuram: "Kancheepuram",
    kancheepuram: "Kancheepuram",
    thiruvarur: "Tiruvarur",
    tiruvarur: "Tiruvarur",
    thiruvallur: "Thiruvallur",
    chengalpattu: "Chengalpattu",
    chengalpattu: "Chengalpattu",
  }),
);

function canon(raw) {
  const t = String(raw).trim();
  const hit = ALIAS.get(t.toLowerCase());
  return hit ?? t;
}

// --- Douglas-Peucker on [lon,lat] (tolerance in degrees) ---
function perpDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const k = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const cx = a[0] + k * dx;
  const cy = a[1] + k * dy;
  return Math.hypot(p[0] - cx, p[1] - cy);
}

function dp(points, tol) {
  if (points.length <= 4) return points;
  const closed =
    points[0][0] === points[points.length - 1][0] &&
    points[0][1] === points[points.length - 1][1];
  const body = closed ? points.slice(0, -1) : points;
  if (body.length <= 3) return points;
  const keep = new Array(body.length).fill(false);
  keep[0] = keep[body.length - 1] = true;
  const stack = [[0, body.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let dmax = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(body[i], body[s], body[e]);
      if (d > dmax) {
        dmax = d;
        idx = i;
      }
    }
    if (dmax > tol && idx > 0) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out = body.filter((_, i) => keep[i]);
  if (closed) out.push([...out[0]]);
  return out;
}

function simplifyRing(ring, tol, maxPts) {
  let out = dp(ring, tol);
  // If still too dense, retry with 2x tolerance (tiny islands collapse fast).
  let t = tol;
  while (out.length > maxPts && t < 0.05) {
    t *= 2;
    out = dp(ring, t);
  }
  // Hard cap: even stride so shape stays even.
  if (out.length > maxPts) {
    const closed =
      out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1];
    const body = closed ? out.slice(0, -1) : out;
    const step = Math.ceil(body.length / (maxPts - 1));
    const cut = body.filter((_, i) => i % step === 0);
    out = closed ? [...cut, [...cut[0]]] : cut;
  }
  // Round to 4 decimals (~11m) to shrink JSON.
  return out.map(([a, b]) => [Math.round(a * 1e4) / 1e4, Math.round(b * 1e4) / 1e4]);
}

async function main() {
  console.log("fetching source…");
  const res = await fetch(SRC);
  if (!res.ok) throw new Error("fetch " + res.status);
  const fc = await res.json();
  console.log("source features:", fc.features.length);

  const TOL = 0.004; // ~440m — keeps wiggles, drops noise
  const out = { type: "FeatureCollection", features: [] };
  let inPts = 0;
  let outPts = 0;

  for (const f of fc.features) {
    const p = f.properties || {};
    const raw = p.dtname ?? p.DTNAME ?? p.district ?? p.name ?? "?";
    const name = canon(raw);
    const g = f.geometry;
    if (!g) continue;
    const simpPoly = (poly) =>
      poly
        .map((ring, ri) => {
          inPts += ring.length;
          const max = ri === 0 ? 320 : 120;
          const s = simplifyRing(ring, ri === 0 ? TOL : TOL * 1.5, max);
          outPts += s.length;
          return s;
        })
        .filter((r) => r.length >= 4);
    let coords = null;
    if (g.type === "Polygon") {
      const ps = simpPoly(g.coordinates);
      if (ps.length) coords = ps;
    } else if (g.type === "MultiPolygon") {
      const mps = g.coordinates.map(simpPoly).filter((ps) => ps.length);
      if (mps.length) coords = mps;
    }
    if (!coords) continue;
    out.features.push({
      type: "Feature",
      properties: { district: name },
      geometry: {
        type: g.type === "MultiPolygon" ? "MultiPolygon" : "Polygon",
        coordinates: coords,
      },
    });
  }

  out.features.sort((a, b) =>
    a.properties.district.localeCompare(b.properties.district),
  );
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out));
  const { size } = await import("node:fs").then((m) =>
    m.promises.stat(OUT),
  );
  console.log("districts:", out.features.map((f) => f.properties.district).join(", "));
  console.log(`points ${inPts} -> ${outPts}`);
  console.log(`wrote ${OUT} (${(size / 1024).toFixed(0)} KB)`);
  if (out.features.length !== 38) console.warn("WARN: expected 38, got " + out.features.length);
  if (!out.features.some((f) => f.properties.district === "Thanjavur"))
    console.warn("WARN: Thanjavur missing!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
