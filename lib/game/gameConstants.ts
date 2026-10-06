// Central tuning values for the prototype.
// Pure data — no React, no Three.js. Safe to import anywhere,
// including a future multiplayer server.

export type RideMode = "walk" | "ride";

export const PLAYER_SPAWN: [number, number, number] = [0, 0, 0];
export const BIKE_SPAWN: [number, number, number] = [3.5, 0, 2.5];
export const BIKE_SPAWN_YAW = -0.6;

export const INTERACT_DISTANCE = 3.2;

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

// --- Third-person camera (free 360° vertical orbit; ground clamp keeps it
// out of the terrain, lookAt stays stable just shy of exact top-down) ---
export const CAM_DISTANCE = 6.5;
export const CAM_RIDE_DISTANCE = 8;
export const CAM_HEIGHT = 1.8;
export const CAM_MIN_PITCH = -1.45;
export const CAM_MAX_PITCH = 1.55;
export const CAM_MIN_DISTANCE = 3.5;
export const CAM_MAX_DISTANCE = 14;

// --- World presentation ---
export const FOG_COLOR = "#bfe3f2";
export const FOG_NEAR = 60;
export const FOG_FAR = 260;
export const SKY_SUN_POSITION: [number, number, number] = [60, 45, -80];
export const GROUND_SIZE = 600;
export const GROUND_TILE_WORLD = 8; // world units per repeating texture tile
export const SCATTER_RANGE = 260; // toroidal wrap radius for trees/rocks
