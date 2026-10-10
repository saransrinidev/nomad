// Central tuning values for the prototype.
// Pure data — no React, no Three.js. Safe to import anywhere,
// including a future multiplayer server.

import { latLonToGame } from "./map/tamilnadu";

export type RideMode = "walk" | "ride" | "train";

// Spawn slabs near real Thanjavur district land (~165 m from Thanjavur Jn).
const _spawn = latLonToGame(79.2, 10.79);

export const PLAYER_SPAWN: [number, number, number] = [
  _spawn.x + 20,
  0,
  _spawn.z,
];
export const BIKE_SPAWN: [number, number, number] = [
  _spawn.x + 23.5,
  0,
  _spawn.z + 2.5,
];
export const BIKE_SPAWN_YAW = -0.6;

export const INTERACT_DISTANCE = 3.2;

// --- Testing-mode spawn picker (TAB): one tap teleports the player + bike
// to any district HQ town. Offsets keep both clear of tracks/platforms.
export interface SpawnPoint {
  name: string;
  detail: string;
  lon: number;
  lat: number;
}

// All 38 Tamil Nadu districts (alphabetical), spawning at the HQ town.
export const SPAWN_POINTS: SpawnPoint[] = [
  { name: "Ariyalur", detail: "HQ · Ariyalur", lon: 79.08, lat: 11.14 },
  { name: "Chengalpattu", detail: "HQ · Chengalpattu", lon: 79.9838, lat: 12.6936 },
  { name: "Chennai", detail: "HQ · Chennai Central", lon: 80.2707, lat: 13.0827 },
  { name: "Coimbatore", detail: "HQ · Coimbatore Jn", lon: 76.9597, lat: 11.0007 },
  { name: "Cuddalore", detail: "HQ · Cuddalore", lon: 79.768, lat: 11.754 },
  { name: "Dharmapuri", detail: "HQ · Dharmapuri", lon: 78.16, lat: 12.13 },
  { name: "Dindigul", detail: "HQ · Dindigul Jn", lon: 77.983, lat: 10.3577 },
  { name: "Erode", detail: "HQ · Erode Jn", lon: 77.7245, lat: 11.2756 },
  { name: "Kallakurichi", detail: "HQ · Kallakurichi", lon: 78.96, lat: 11.74 },
  { name: "Kancheepuram", detail: "HQ · Kanchipuram", lon: 79.7065, lat: 12.8426 },
  { name: "Kanyakumari", detail: "HQ · Nagercoil", lon: 77.4373, lat: 8.1757 },
  { name: "Karur", detail: "HQ · Karur Jn", lon: 78.0733, lat: 10.9601 },
  { name: "Krishnagiri", detail: "HQ · Krishnagiri", lon: 78.21, lat: 12.52 },
  { name: "Madurai", detail: "HQ · Madurai Jn", lon: 78.1023, lat: 9.9194 },
  { name: "Mayiladuthurai", detail: "HQ · Mayiladuthurai", lon: 79.6528, lat: 11.1012 },
  { name: "Nagapattinam", detail: "HQ · Nagapattinam", lon: 79.83, lat: 10.77 },
  { name: "Namakkal", detail: "HQ · Namakkal", lon: 78.17, lat: 11.22 },
  { name: "Nilgiris", detail: "HQ · Ooty", lon: 76.6953, lat: 11.4085 },
  { name: "Perambalur", detail: "HQ · Perambalur", lon: 78.88, lat: 11.23 },
  { name: "Pudukkottai", detail: "HQ · Pudukkottai", lon: 78.8204, lat: 10.3797 },
  { name: "Ramanathapuram", detail: "HQ · Ramanathapuram", lon: 78.8273, lat: 9.3693 },
  { name: "Ranipet", detail: "HQ · Ranipet", lon: 79.33, lat: 12.93 },
  { name: "Salem", detail: "HQ · Salem Jn", lon: 78.1401, lat: 11.652 },
  { name: "Sivaganga", detail: "HQ · Sivagangai", lon: 78.48, lat: 9.84 },
  { name: "Tenkasi", detail: "HQ · Tenkasi", lon: 77.31, lat: 8.96 },
  { name: "Thanjavur", detail: "HQ · Thanjavur", lon: 79.2, lat: 10.79 },
  { name: "Theni", detail: "HQ · Theni", lon: 77.48, lat: 10.01 },
  { name: "Thoothukudi", detail: "HQ · Thoothukudi", lon: 78.131, lat: 8.8072 },
  { name: "Tiruchirappalli", detail: "HQ · Trichy Jn", lon: 78.6856, lat: 10.7905 },
  { name: "Tirunelveli", detail: "HQ · Tirunelveli Jn", lon: 77.7079, lat: 8.7359 },
  { name: "Tirupathur", detail: "HQ · Tirupattur", lon: 78.57, lat: 12.5 },
  { name: "Tiruppur", detail: "HQ · Tiruppur", lon: 77.3395, lat: 11.1088 },
  { name: "Tiruvallur", detail: "HQ · Tiruvallur", lon: 79.91, lat: 13.14 },
  { name: "Tiruvannamalai", detail: "HQ · Tiruvannamalai", lon: 79.0747, lat: 12.2319 },
  { name: "Tiruvarur", detail: "HQ · Tiruvarur", lon: 79.51, lat: 10.77 },
  { name: "Vellore", detail: "HQ · Vellore", lon: 79.13, lat: 12.92 },
  { name: "Viluppuram", detail: "HQ · Viluppuram", lon: 79.4917, lat: 11.9401 },
  { name: "Virudhunagar", detail: "HQ · Virudhunagar", lon: 77.9624, lat: 9.568 },
];

// --- On-foot movement ---
export const WALK_SPEED = 4.5;
export const RUN_SPEED = 8.5;
export const PLAYER_ACCEL = 12; // responsiveness of speed blending
export const PLAYER_TURN_SPEED = 12; // yaw smoothing rate
export const GRAVITY = 22;

// --- Arcade bike movement (top speed: 150 km/h = 41.7 m/s) ---
// Torque taper: punchy launch that fades toward top speed, like a real
// power curve (0-100 km/h ~4-5s, full 150 in ~9-10s).
export const BIKE_MAX_SPEED = 41.7;
export const BIKE_MAX_REVERSE = -7;
export const BIKE_LAUNCH_ACCEL = 9;
export const BIKE_TAPER = 0.92;
export const BIKE_BRAKE = 34;
export const BIKE_DRAG = 2.5; // base drag; plus speed-proportional engine braking
export const BIKE_ENGINE_BRAKING = 3.2; // extra drag at full speed when off throttle
export const BIKE_REVERSE_ACCEL = 10;
export const BIKE_TURN_RATE = 2.1;
export const BIKE_STEER_SPEED = 6;
/** Parked lean onto the side stand (roll, radians). */
export const BIKE_PARK_LEAN = -0.16;

// --- Crash physics (bike ejection). Below CRASH_MIN_SPEED an impact just
// stops the bike; above it the rider is launched on a ballistic arc.
// Eject: horizontal keeps CRASH_KEEP of impact speed (capped), vertical pop
// scales with speed (capped). g = GRAVITY (22 m/s²).
export const CRASH_MIN_SPEED = 10; // m/s (~36 km/h)
export const CRASH_KEEP = 0.75;
export const CRASH_MAX_FLY = 26; // m/s horizontal cap
export const CRASH_POP_BASE = 3;
export const CRASH_POP_RATE = 0.22;
export const CRASH_POP_MAX = 9.5; // m/s vertical cap
export const CRASH_SPIN_BASE = 6; // rad/s tumble
export const CRASH_SPIN_RATE = 0.25;
export const CRASH_SPIN_MAX = 14;
export const CRASH_BOUNCE_VY = 13.5; // slam harder than this bounces once
export const CRASH_BOUNCE_KEEP = 0.35;
export const CRASH_STUN_BASE = 0.8; // s dazed on landing
export const CRASH_STUN_RATE = 0.06;
export const CRASH_STUN_MAX = 2.0;

// --- Third-person camera (free 360° vertical orbit; ground clamp keeps it
// out of the terrain, lookAt stays stable just shy of exact top-down) ---
export const CAM_DISTANCE = 6.5;
export const CAM_RIDE_DISTANCE = 8;
export const CAM_HEIGHT = 1.5;
export const CAM_MIN_PITCH = -1.45;
export const CAM_MAX_PITCH = 1.55;
export const CAM_MIN_DISTANCE = 3.5;
export const CAM_MAX_DISTANCE = 14;

// --- World presentation (16x16 km Tamil Nadu plain) ---
export const FOG_COLOR = "#bfe3f2";
export const FOG_NEAR = 300;
export const FOG_FAR = 3600;
export const SKY_SUN_POSITION: [number, number, number] = [240, 180, -320];
export const GROUND_SIZE = 600;
export const GROUND_TILE_WORLD = 8; // world units per repeating texture tile
export const SCATTER_RANGE = 1200; // (unused while scatter is stripped)
