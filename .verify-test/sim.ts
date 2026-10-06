// Headless verification: central hut village (spawn clear, colliders, walk).
import { createInitialWorld } from "../lib/game/state";
import { updateOnFoot, nearestDoor } from "../lib/game/playerController";
import {
  BUILDING_DOORS,
  BUILDING_TYPES,
  buildSettlement,
  buildVillage,
  SURROUNDING_VILLAGES,
  VILLAGE_CENTER,
  VILLAGE_COLLIDERS,
  VILLAGE_HOUSES,
  VILLAGE_NAME,
  VILLAGE_ROADS,
} from "../lib/game/map/village";
import { ROOM_HALF_X, ROOM_HALF_Z } from "../lib/game/map/interior";

let failures = 0;
function check(name: string, cond: boolean, detail: string) {
  if (cond) console.log(`PASS  ${name}  (${detail})`);
  else {
    failures++;
    console.log(`FAIL  ${name}  (${detail})`);
  }
}

check("name", VILLAGE_NAME === "THANJAVUR", VILLAGE_NAME);
check("village-center", VILLAGE_CENTER[0] === 0 && VILLAGE_CENTER[2] === 0, "middle of map");
check("buildings", VILLAGE_HOUSES.length > 0, `${VILLAGE_HOUSES.length} buildings`);
check("roads", VILLAGE_ROADS.length >= 2, `${VILLAGE_ROADS.length} connected dirt segments`);

// City center exists at the middle, surrounded by villages on a wide ring.
{
  const city = VILLAGE_HOUSES.filter((h) => h.kind === "city");
  const vil = VILLAGE_HOUSES.filter((h) => h.kind === "village");
  check("has-city", city.length > 0, `${city.length} city buildings`);
  check("has-villages", SURROUNDING_VILLAGES.length > 0, `${SURROUNDING_VILLAGES.length} villages`);

  // City sits in the core; village huts sit farther out (surrounding it).
  const cityMaxR = Math.max(...city.map((h) => Math.hypot(h.dx, h.dz)));
  const vilMinR = Math.min(...vil.map((h) => Math.hypot(h.dx, h.dz)));
  check(
    "city-surrounded",
    vilMinR > cityMaxR,
    `city<=${cityMaxR.toFixed(0)}m, villages>=${vilMinR.toFixed(0)}m`,
  );
}

// Parametric generator: honors requested city size + village/hut counts, and
// the road network stays connected for any configuration.
{
  for (const [cs, vc, hpv] of [
    [20, 6, 7],
    [30, 8, 6],
    [12, 4, 10],
  ] as const) {
    const s = buildSettlement({ citySize: cs, villageCount: vc, hutsPerVillage: hpv });
    const expected = cs + vc * hpv;
    check(`build-${cs}-${vc}-${hpv}`, s.houses.length === expected, `${s.houses.length}/${expected} buildings`);
    check(`build-${cs}-${vc}-${hpv}-villages`, s.villageCenters.length === vc, `${s.villageCenters.length} villages`);
    check(`build-${cs}-${vc}-${hpv}-roads`, s.roads.length >= 2, `${s.roads.length} road segments`);
    const minR = Math.min(...s.houses.map((h) => Math.hypot(h.dx, h.dz)));
    check(`build-${cs}-${vc}-${hpv}-plaza`, minR >= 22, `nearest building r=${minR.toFixed(1)}`);
  }

  // Back-compat: buildVillage(n) yields a city of n with no villages.
  const bv = buildVillage(25);
  check("buildVillage-compat", bv.houses.length === 25 && bv.villageCenters.length === 0, `${bv.houses.length} buildings, ${bv.villageCenters.length} villages`);
}

// Enterable buildings: every building is typed, and has a matching door.
{
  check(
    "every-building-typed",
    VILLAGE_HOUSES.every((h) => h.type in BUILDING_TYPES),
    `${VILLAGE_HOUSES.length} typed`,
  );
  check(
    "door-per-building",
    BUILDING_DOORS.length === VILLAGE_HOUSES.length,
    `${BUILDING_DOORS.length} doors`,
  );
  // The town should include the headline services at least once.
  const types = new Set(VILLAGE_HOUSES.map((h) => h.type));
  check("has-hospital", types.has("hospital"), "hospital present");
  check("has-hotel", types.has("hotel"), "hotel present");
  check("has-supermarket", types.has("supermarket"), "supermarket present");

  // Each door sits just outside its building, matching the house index.
  const d0 = BUILDING_DOORS[0];
  const h0 = VILLAGE_HOUSES[d0.houseIndex];
  check(
    "door-outside-building",
    Math.abs(d0.x - (VILLAGE_CENTER[0] + h0.dx)) < 0.01 &&
      d0.z > VILLAGE_CENTER[2] + h0.dz,
    `door0 at (${d0.x.toFixed(1)}, ${d0.z.toFixed(1)})`,
  );
}

// Entering a building: nearestDoor finds it, and interior movement is clamped
// to the room (no leaking through walls).
{
  const w = createInitialWorld();
  const d = BUILDING_DOORS[0];
  w.playerPos.set(d.x, 0, d.z);
  check("nearest-door", nearestDoor(w) === 0, `idx=${nearestDoor(w)}`);

  // Simulate being inside and walking hard into a wall.
  w.interior = d.type;
  w.playerPos.set(0, 0, 0);
  w.camYaw = 0;
  w.keys.forward = true; // drive toward +Z... (camera-relative)
  for (let i = 0; i < 240; i++) updateOnFoot(w, 1 / 60);
  const insideBounds =
    Math.abs(w.playerPos.x) <= ROOM_HALF_X &&
    Math.abs(w.playerPos.z) <= ROOM_HALF_Z;
  check(
    "interior-walls",
    insideBounds,
    `pos=(${w.playerPos.x.toFixed(1)}, ${w.playerPos.z.toFixed(1)}) in ${ROOM_HALF_X}x${ROOM_HALF_Z}`,
  );
}

// 1. Spawn + bike spawn sit clear of every collider.
{
  const clear = (x: number, z: number) =>
    VILLAGE_COLLIDERS.every(
      (c) => Math.abs(x - c.x) >= c.halfX || Math.abs(z - c.z) >= c.halfZ,
    );
  check("spawn-clear", clear(0, 0), "player (0,0)");
  check("bike-clear", clear(3.5, 2.5), "bike (3.5,2.5)");
}

// 2. Fresh spawn doesn't get pushed on the first frame.
{
  const w = createInitialWorld();
  updateOnFoot(w, 1 / 60);
  check(
    "spawn-stable",
    Math.abs(w.playerPos.x) < 0.01 && Math.abs(w.playerPos.z) < 0.01,
    `pos=(${w.playerPos.x.toFixed(2)}, ${w.playerPos.z.toFixed(2)})`,
  );
}

// 3. Hut collider pushes the player out.
{
  const c = VILLAGE_COLLIDERS[0];
  const w = createInitialWorld();
  w.playerPos.set(c.x, 0, c.z);
  updateOnFoot(w, 1 / 60);
  const out =
    Math.abs(w.playerPos.x - c.x) >= c.halfX || Math.abs(w.playerPos.z - c.z) >= c.halfZ;
  check("hut-collider", out, `pushed to (${w.playerPos.x.toFixed(1)}, ${w.playerPos.z.toFixed(1)})`);
}

// 4. Walking still works.
{
  const p = createInitialWorld();
  p.keys.forward = true;
  for (let i = 0; i < 120; i++) updateOnFoot(p, 1 / 60);
  check("walk-ok", p.playerMoving && p.playerPos.z < -7, `z=${p.playerPos.z.toFixed(2)}`);
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log("\nAll logic checks passed.");
}
