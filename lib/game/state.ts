// Shared mutable game state.
// A single plain object (created once in Game.tsx) is passed by reference
// to every 3D component. Rapidly changing values (positions, speeds) live
// here in refs/fields so the render loop never triggers React re-renders.
// Discrete UI state (mode, prompts) is mirrored to React state at low
// frequency by GameRig. This layout maps 1:1 to future multiplayer snapshots.

import * as THREE from "three";
import {
  BIKE_SPAWN,
  BIKE_SPAWN_YAW,
  CAM_DISTANCE,
  PLAYER_SPAWN,
  type RideMode,
} from "./gameConstants";
import { START_TIME } from "./map/time";
import { groundHeight } from "./map/terrain";
import { initialTrainState, clearGroundSpot, type TrainSimState } from "./map/railway";

export interface KeyState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
  brake: boolean;
}

export function createEmptyKeys(): KeyState {
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    run: false,
    brake: false,
  };
}

export interface GameWorld {
  mode: RideMode;
  keys: KeyState;
  /** Freeze all simulation (ESC menu). Rendering continues. */
  paused: boolean;
  /** Fullscreen map open: inputs are swallowed so the pre-map held keys
   * can be restored on close (see Game.tsx openMap/closeMap). */
  mapOpen: boolean;
  /** Testing-mode spawn picker open (TAB): same input-freeze treatment. */
  spawnOpen: boolean;

  // Player (on-foot) state
  playerPos: THREE.Vector3;
  playerYaw: number;
  playerVelY: number;
  playerSpeed: number; // horizontal speed, for animation + HUD
  playerMoving: boolean;
  playerRunning: boolean;
  walkPhase: number;
  /** Ballistic flight after a bike crash (see bikeController ejectRider). */
  crashFlying: boolean;
  /** World-space flight velocity while crashFlying. */
  crashVel: THREE.Vector3;
  /** Tumble rate (rad/s) for the crash visual. */
  crashSpin: number;
  /** Seconds of no-input daze after landing a crash. */
  stun: number;

  // Bike state
  bikePos: THREE.Vector3;
  bikeYaw: number;
  bikeSpeed: number;
  bikeSteer: number;
  /** True velocity (lags heading while drifting). */
  bikeVel: THREE.Vector3;
  /** Handbrake slide active (for skid marks + HUD). */
  bikeDrift: boolean;
  /** Engine running. Persists across dismounts (X toggles). */
  engineOn: boolean;
  /** Bike lights on/off (L toggles). */
  lightsOn: boolean;
  wheelSpin: number;

  // Shared third-person camera orbit state
  camYaw: number;
  camPitch: number;
  camDistance: number;
  /** True once the user scroll-zooms; auto ride/walk framing yields until the next mount/dismount. */
  camManualZoom: boolean;

  // Interaction
  nearBike: boolean;

  /** Time of day in game hours (0-24). 1 real minute = 1 game hour. */
  time: number;

  // Railway consists, one per line (simulated in Train.tsx useFrame).
  trains: TrainSimState[];
  /** Coach seat assignment while riding a train, null otherwise. */
  trainSeat: { line: string; car: number; side: 1 | -1; lying: boolean } | null;
}

export function createInitialWorld(): GameWorld {
  // Spawn on the terrain surface: the island plate sits at ~2 m, so the
  // raw [x, 0, z] spawn constants would bury the bike under the ground
  // (the parked bike never runs the ride controller that grounds it).
  const playerPos = new THREE.Vector3(...PLAYER_SPAWN);
  // Boot onto open district land (never station premises): nudge clear of
  // every rail before grounding.
  const clearP = clearGroundSpot(playerPos.x, playerPos.z);
  playerPos.set(clearP.x, 0, clearP.z);
  playerPos.y = groundHeight(playerPos.x, playerPos.z);
  const bikePos = new THREE.Vector3(...BIKE_SPAWN);
  const clearB = clearGroundSpot(bikePos.x, bikePos.z, 20);
  bikePos.set(clearB.x, 0, clearB.z);
  bikePos.y = groundHeight(bikePos.x, bikePos.z);
  return {
    mode: "walk",
    keys: createEmptyKeys(),
    paused: false,
    mapOpen: false,
    spawnOpen: false,

    playerPos,
    playerYaw: 0,
    playerVelY: 0,
    playerSpeed: 0,
    playerMoving: false,
    playerRunning: false,
    walkPhase: 0,
    crashFlying: false,
    crashVel: new THREE.Vector3(),
    crashSpin: 0,
    stun: 0,

    bikePos,
    bikeYaw: BIKE_SPAWN_YAW,
    bikeSpeed: 0,
    bikeSteer: 0,
    bikeVel: new THREE.Vector3(),
    bikeDrift: false,
    engineOn: true,
    lightsOn: true,
    wheelSpin: 0,

    camYaw: Math.PI,
    camPitch: 0.32,
    camDistance: CAM_DISTANCE,
    camManualZoom: false,

    nearBike: false,

    time: START_TIME,

    trains: initialTrainState(),
    trainSeat: null,
  };
}

/** Active focus point: the bike when riding, the player otherwise. */
export function getFocusPoint(world: GameWorld): THREE.Vector3 {
  return world.mode === "ride" ? world.bikePos : world.playerPos;
}
