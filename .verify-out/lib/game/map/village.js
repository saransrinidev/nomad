"use strict";
// THANJAVUR at the middle of the map: a parametric settlement generator.
// Layout = a dense CITY CENTER at the plaza, SURROUNDED BY VILLAGES (small
// hamlets of mud huts) spread around it on a wide ring. A connected dirt road
// network links the city to every outlying village. Pure arithmetic, fully
// deterministic (no randomness).
//
// Invariants preserved for any size:
//  - The central plaza / spawn clearing (r < PLAZA_CLEAR) stays empty.
//  - Buildings are angularly offset so they never sit on the radial spokes.
//  - Colliders are derived from every placed building + the well.
Object.defineProperty(exports, "__esModule", { value: true });
exports.VILLAGE_PLAZA_CLEAR = exports.VILLAGE_COLLIDERS = exports.VILLAGE_SIGN = exports.VILLAGE_WELL = exports.VILLAGE_TREES = exports.BUILDING_DOORS = exports.SURROUNDING_VILLAGES = exports.VILLAGE_ROADS = exports.VILLAGE_HOUSES = exports.BUILDING_TYPES = exports.DEFAULT_VILLAGE_SIZE = exports.DEFAULT_HUTS_PER_VILLAGE = exports.DEFAULT_VILLAGE_COUNT = exports.DEFAULT_CITY_SIZE = exports.VILLAGE_NAME = exports.VILLAGE_CENTER = void 0;
exports.buildSettlement = buildSettlement;
exports.buildVillage = buildVillage;
exports.buildColliders = buildColliders;
exports.VILLAGE_CENTER = [0, 0, 0];
exports.VILLAGE_NAME = "THANJAVUR";
/** Default building count for the city center. */
exports.DEFAULT_CITY_SIZE = 16;
/** Default number of surrounding villages. */
exports.DEFAULT_VILLAGE_COUNT = 6;
/** Default huts per surrounding village. */
exports.DEFAULT_HUTS_PER_VILLAGE = 7;
/** Back-compat alias: default size of the central settlement. */
exports.DEFAULT_VILLAGE_SIZE = exports.DEFAULT_CITY_SIZE;
/** Registry of every building purpose and its presentation accent. */
exports.BUILDING_TYPES = {
    hospital: { id: "hospital", label: "Hospital", accent: "#e23b3b" },
    hotel: { id: "hotel", label: "Hotel", accent: "#c9a227" },
    supermarket: { id: "supermarket", label: "Supermarket", accent: "#2e9e4f" },
    pharmacy: { id: "pharmacy", label: "Pharmacy", accent: "#1b9e8a" },
    restaurant: { id: "restaurant", label: "Restaurant", accent: "#e2742b" },
    bank: { id: "bank", label: "Bank", accent: "#2d5fa6" },
    school: { id: "school", label: "School", accent: "#8a4fb0" },
    house: { id: "house", label: "Home", accent: "#8d6a44" },
};
// Cities get the civic/commercial mix; villages are mostly homes with a few
// essential services. Assigned in order, cycling, so layouts stay deterministic.
const CITY_TYPE_CYCLE = [
    "hospital",
    "hotel",
    "supermarket",
    "bank",
    "restaurant",
    "pharmacy",
    "school",
];
const VILLAGE_TYPE_CYCLE = [
    "house",
    "house",
    "supermarket",
    "house",
    "pharmacy",
    "house",
    "restaurant",
];
// City buildings: brick/stone walls, tiled (terracotta) roofs, taller.
const CITY_WALLS = ["#d9cdbf", "#cbb79e", "#e2d6c4", "#c2a88a"];
const CITY_ROOFS = ["#9c4b2e", "#8a3f27", "#b25636"];
// Village huts: mud walls, thatched roofs, shorter.
const MUD_WALLS = ["#c9a06b", "#d4b48c", "#b98d5e", "#cbb28a"];
const THATCH_ROOFS = ["#b89b4a", "#9a7d3c", "#a8893f"];
// --- Layout tuning constants ---------------------------------------------
/** Radius of the empty central plaza / spawn clearing. */
const PLAZA_CLEAR = 22;
/** City rings start just outside the plaza. */
const CITY_FIRST_RING = 24;
const CITY_RING_STEP = 16;
const CITY_ARC_SPACING = 13;
/** Surrounding villages sit on this ring, beyond the city. */
const VILLAGE_RING = 110;
/** Radius of each small surrounding village cluster. */
const HAMLET_RADIUS = 16;
const HAMLET_ARC_SPACING = 12;
/** Width of a main travel road (wide, two-lane feel). */
const ROAD_W = 10;
/** Narrower lane for the small hamlet ring roads. */
const LANE_W = 7;
/** Place `n` structures in concentric rings around a point. */
function ringLayout(n, firstRing, ringStep, arcSpacing) {
    const spots = [];
    let placed = 0;
    let ringIndex = 0;
    while (placed < n) {
        const r = firstRing + ringIndex * ringStep;
        const capacity = Math.max(3, Math.round((2 * Math.PI * r) / arcSpacing));
        const take = Math.min(capacity, n - placed);
        const off = Math.PI / take + (ringIndex % 2) * (Math.PI / take);
        for (let k = 0; k < take; k++) {
            spots.push({ r, a: off + (k / take) * Math.PI * 2 });
        }
        placed += take;
        ringIndex++;
    }
    return spots;
}
/**
 * Build THANJAVUR: a central city surrounded by villages, with a connected
 * dirt road network linking the city to every village. Deterministic.
 */
function buildSettlement(opts = {}) {
    const citySize = Math.max(0, Math.floor(opts.citySize ?? exports.DEFAULT_CITY_SIZE));
    const villageCount = Math.max(0, Math.floor(opts.villageCount ?? exports.DEFAULT_VILLAGE_COUNT));
    const hutsPerVillage = Math.max(0, Math.floor(opts.hutsPerVillage ?? exports.DEFAULT_HUTS_PER_VILLAGE));
    const houses = [];
    // 1. City center — taller brick buildings in tight rings around the plaza.
    const citySpots = ringLayout(citySize, CITY_FIRST_RING, CITY_RING_STEP, CITY_ARC_SPACING);
    citySpots.forEach((s, i) => {
        houses.push({
            dx: Math.cos(s.a) * s.r,
            dz: Math.sin(s.a) * s.r,
            w: 8 + (i % 3),
            d: 7 + ((i + 1) % 3),
            h: 7 + ((i * 5) % 4) * 1.1, // tall city blocks
            wall: CITY_WALLS[i % CITY_WALLS.length],
            roof: CITY_ROOFS[i % CITY_ROOFS.length],
            kind: "city",
            type: CITY_TYPE_CYCLE[i % CITY_TYPE_CYCLE.length],
        });
    });
    // 2. Surrounding villages — hamlets of mud huts spaced evenly on a wide ring.
    const villageCenters = [];
    for (let v = 0; v < villageCount; v++) {
        const va = (v / villageCount) * Math.PI * 2 + Math.PI / villageCount;
        const vcx = Math.cos(va) * VILLAGE_RING;
        const vcz = Math.sin(va) * VILLAGE_RING;
        villageCenters.push({ dx: vcx, dz: vcz });
        const hutSpots = ringLayout(hutsPerVillage, HAMLET_RADIUS * 0.5, HAMLET_RADIUS * 0.5, HAMLET_ARC_SPACING);
        hutSpots.forEach((s, j) => {
            const i = v * 100 + j;
            houses.push({
                dx: vcx + Math.cos(s.a) * s.r,
                dz: vcz + Math.sin(s.a) * s.r,
                w: 6 + (i % 3),
                d: 5 + ((i + 1) % 3),
                h: 3 + ((i * 7) % 3) * 0.4, // short huts
                wall: MUD_WALLS[i % MUD_WALLS.length],
                roof: THATCH_ROOFS[i % THATCH_ROOFS.length],
                kind: "village",
                type: VILLAGE_TYPE_CYCLE[j % VILLAGE_TYPE_CYCLE.length],
            });
        });
    }
    // 3. Doors — one per building, just outside the +Z wall (matches the door
    //    mesh placed in Village.tsx). Entering faces the player into the room.
    const doors = houses.map((h, i) => ({
        houseIndex: i,
        x: exports.VILLAGE_CENTER[0] + h.dx,
        z: exports.VILLAGE_CENTER[2] + h.dz + h.d / 2 + 0.8,
        yaw: Math.PI, // facing -Z, into the building
        type: h.type,
        label: exports.BUILDING_TYPES[h.type].label,
    }));
    // 4. Roads: city ring roads + spokes reaching out to each village.
    const cityRadii = Array.from(new Set(citySpots.map((s) => s.r)));
    const outerRadius = villageCount > 0 ? VILLAGE_RING + HAMLET_RADIUS : (cityRadii.at(-1) ?? CITY_FIRST_RING);
    const roads = buildRoads(cityRadii, villageCenters, outerRadius);
    return { houses, roads, doors, villageCenters, outerRadius };
}
/**
 * Connected dirt network:
 *  - A square ring road around each occupied city ring (links city blocks).
 *  - A straight spoke from the plaza out to each surrounding village center.
 *  - A small square ring road around each village (links that hamlet's huts).
 * Every structure therefore connects back to the central plaza.
 */
function buildRoads(cityRadii, villageCenters, outerRadius) {
    const roads = [];
    // City ring roads (four thin boxes forming a frame per radius).
    for (const r of cityRadii) {
        const side = r * 2;
        roads.push({ x: 0, z: -r, w: side, d: ROAD_W });
        roads.push({ x: 0, z: r, w: side, d: ROAD_W });
        roads.push({ x: -r, z: 0, w: ROAD_W, d: side });
        roads.push({ x: r, z: 0, w: ROAD_W, d: side });
    }
    // Base crossroads through the plaza so the city core is fully linked.
    const coreSpan = (cityRadii.at(-1) ?? CITY_FIRST_RING) * 2 + CITY_RING_STEP;
    roads.push({ x: 0, z: 0, w: coreSpan, d: ROAD_W });
    roads.push({ x: 0, z: 0, w: ROAD_W, d: coreSpan });
    // Wide travel spoke out to each surrounding village: an L-shaped main road
    // (horizontal leg then vertical leg) plus a lane ring framing the hamlet.
    for (const vc of villageCenters) {
        const midX = vc.dx / 2;
        const midZ = vc.dz / 2;
        // Horizontal leg from the plaza across to the village's x.
        roads.push({ x: midX, z: 0, w: Math.abs(vc.dx) + ROAD_W, d: ROAD_W });
        // Vertical leg from the x-axis up to the village center.
        roads.push({ x: vc.dx, z: midZ, w: ROAD_W, d: Math.abs(vc.dz) + ROAD_W });
        // Lane ring framing the hamlet (links its huts).
        const hr = HAMLET_RADIUS * 0.5;
        const side = hr * 2 + LANE_W;
        roads.push({ x: vc.dx, z: vc.dz - hr, w: side, d: LANE_W });
        roads.push({ x: vc.dx, z: vc.dz + hr, w: side, d: LANE_W });
        roads.push({ x: vc.dx - hr, z: vc.dz, w: LANE_W, d: side });
        roads.push({ x: vc.dx + hr, z: vc.dz, w: LANE_W, d: side });
    }
    return roads;
}
// --- Default settlement instance -----------------------------------------
const DEFAULT_SETTLEMENT = buildSettlement();
exports.VILLAGE_HOUSES = DEFAULT_SETTLEMENT.houses;
/** Dirt road rectangles (offsets from center) connecting the whole town. */
exports.VILLAGE_ROADS = DEFAULT_SETTLEMENT.roads;
/** World offsets of each surrounding village center. */
exports.SURROUNDING_VILLAGES = DEFAULT_SETTLEMENT.villageCenters;
/** Enterable building doors (world positions + type) for the default town. */
exports.BUILDING_DOORS = DEFAULT_SETTLEMENT.doors;
/**
 * Back-compat shim: previous callers used `buildVillage(count)` to make a
 * single ringed village. It now returns the central city of that size with
 * no surrounding villages.
 */
function buildVillage(count = exports.DEFAULT_CITY_SIZE) {
    return buildSettlement({ citySize: count, villageCount: 0, hutsPerVillage: 0 });
}
/** Static trees ringing the city (offsets from center). */
exports.VILLAGE_TREES = [
    { dx: -62, dz: -30, s: 1.1 },
    { dx: 64, dz: -28, s: 0.9 },
    { dx: -64, dz: 32, s: 1.2 },
    { dx: 62, dz: 34, s: 1.0 },
    { dx: 0, dz: -66, s: 1.1 },
    { dx: -10, dz: 66, s: 0.85 },
    { dx: 34, dz: -58, s: 1.0 },
    { dx: -36, dz: 60, s: 0.95 },
];
exports.VILLAGE_WELL = { dx: 8, dz: 34 };
exports.VILLAGE_SIGN = { dx: -58, dz: 0 };
/** Build absolute-position AABB colliders for a town's buildings + the well. */
function buildColliders(houses) {
    return [
        ...houses.map((h) => ({
            x: exports.VILLAGE_CENTER[0] + h.dx,
            z: exports.VILLAGE_CENTER[2] + h.dz,
            halfX: h.w / 2 + 0.4,
            halfZ: h.d / 2 + 0.4,
        })),
        {
            x: exports.VILLAGE_CENTER[0] + exports.VILLAGE_WELL.dx,
            z: exports.VILLAGE_CENTER[2] + exports.VILLAGE_WELL.dz,
            halfX: 1.8,
            halfZ: 1.8,
        },
    ];
}
/** Absolute-position AABB colliders (buildings + well) for the default town. */
exports.VILLAGE_COLLIDERS = buildColliders(exports.VILLAGE_HOUSES);
// Reference the plaza-clear constant so changing the layout keeps the spawn
// clearing honored by consumers that want to validate it.
exports.VILLAGE_PLAZA_CLEAR = PLAZA_CLEAR;
