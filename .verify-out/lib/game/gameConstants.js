"use strict";
// Central tuning values for the prototype.
// Pure data — no React, no Three.js. Safe to import anywhere,
// including a future multiplayer server.
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCATTER_RANGE = exports.GROUND_TILE_WORLD = exports.GROUND_SIZE = exports.SKY_SUN_POSITION = exports.FOG_FAR = exports.FOG_NEAR = exports.FOG_COLOR = exports.CAM_MAX_DISTANCE = exports.CAM_MIN_DISTANCE = exports.CAM_MAX_PITCH = exports.CAM_MIN_PITCH = exports.CAM_HEIGHT = exports.CAM_RIDE_DISTANCE = exports.CAM_DISTANCE = exports.BIKE_PARK_LEAN = exports.BIKE_STEER_SPEED = exports.BIKE_TURN_RATE = exports.BIKE_REVERSE_ACCEL = exports.BIKE_ENGINE_BRAKING = exports.BIKE_DRAG = exports.BIKE_BRAKE = exports.BIKE_TAPER = exports.BIKE_LAUNCH_ACCEL = exports.BIKE_MAX_REVERSE = exports.BIKE_MAX_SPEED = exports.GRAVITY = exports.PLAYER_TURN_SPEED = exports.PLAYER_ACCEL = exports.RUN_SPEED = exports.WALK_SPEED = exports.INTERACT_DISTANCE = exports.BIKE_SPAWN_YAW = exports.BIKE_SPAWN = exports.PLAYER_SPAWN = void 0;
exports.PLAYER_SPAWN = [0, 0, 0];
exports.BIKE_SPAWN = [3.5, 0, 2.5];
exports.BIKE_SPAWN_YAW = -0.6;
exports.INTERACT_DISTANCE = 3.2;
// --- On-foot movement ---
exports.WALK_SPEED = 4.5;
exports.RUN_SPEED = 8.5;
exports.PLAYER_ACCEL = 12; // responsiveness of speed blending
exports.PLAYER_TURN_SPEED = 12; // yaw smoothing rate
exports.GRAVITY = 22;
// --- Arcade bike movement (top speed: 150 km/h = 41.7 m/s) ---
// Torque taper: punchy launch that fades toward top speed, like a real
// power curve (0-100 km/h ~4-5s, full 150 in ~9-10s).
exports.BIKE_MAX_SPEED = 41.7;
exports.BIKE_MAX_REVERSE = -7;
exports.BIKE_LAUNCH_ACCEL = 9;
exports.BIKE_TAPER = 0.92;
exports.BIKE_BRAKE = 34;
exports.BIKE_DRAG = 2.5; // base drag; plus speed-proportional engine braking
exports.BIKE_ENGINE_BRAKING = 3.2; // extra drag at full speed when off throttle
exports.BIKE_REVERSE_ACCEL = 10;
exports.BIKE_TURN_RATE = 2.1;
exports.BIKE_STEER_SPEED = 6;
/** Parked lean onto the side stand (roll, radians). */
exports.BIKE_PARK_LEAN = -0.16;
// --- Third-person camera (free 360° vertical orbit; ground clamp keeps it
// out of the terrain, lookAt stays stable just shy of exact top-down) ---
exports.CAM_DISTANCE = 6.5;
exports.CAM_RIDE_DISTANCE = 8;
exports.CAM_HEIGHT = 1.8;
exports.CAM_MIN_PITCH = -1.45;
exports.CAM_MAX_PITCH = 1.55;
exports.CAM_MIN_DISTANCE = 3.5;
exports.CAM_MAX_DISTANCE = 14;
// --- World presentation ---
exports.FOG_COLOR = "#bfe3f2";
exports.FOG_NEAR = 60;
exports.FOG_FAR = 260;
exports.SKY_SUN_POSITION = [60, 45, -80];
exports.GROUND_SIZE = 600;
exports.GROUND_TILE_WORLD = 8; // world units per repeating texture tile
exports.SCATTER_RANGE = 260; // toroidal wrap radius for trees/rocks
