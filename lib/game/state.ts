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
import type { BuildingType } from "./map/village";
import { START_TIME } from "./map/time";
import { initialTrainState, type TrainSimState } from "./map/railway";

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

  // Player (on-foot) state
  playerPos: THREE.Vector3;
  playerYaw: number;
  playerVelY: number;
  playerSpeed: number; // horizontal speed, for animation + HUD
  playerMoving: boolean;
  playerRunning: boolean;
  walkPhase: number;

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
  /** Index into BUILDING_DOORS of the door the player is standing at, or null. */
  nearDoor: number | null;

  // Interior scene
  /** Building type whose interior the player is currently inside, or null outdoors. */
  interior: BuildingType | null;
  /** Outdoor position to restore when the player exits the building. */
  returnPos: THREE.Vector3;
  returnYaw: number;

  /** Time of day in game hours (0-24). 1 real minute = 1 game hour. */
  time: number;

  // Railway consists, one per line (simulated in Train.tsx useFrame).
  trains: TrainSimState[];
  /** Coach seat assignment while riding a train, null otherwise. */
  trainSeat: { line: string; car: number; side: 1 | -1; lying: boolean } | null;
}

export function createInitialWorld(): GameWorld {
  return {
    mode: "walk",
    keys: createEmptyKeys(),
    paused: false,

    playerPos: new THREE.Vector3(...PLAYER_SPAWN),
    playerYaw: 0,
    playerVelY: 0,
    playerSpeed: 0,
    playerMoving: false,
    playerRunning: false,
    walkPhase: 0,

    bikePos: new THREE.Vector3(...BIKE_SPAWN),
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
    nearDoor: null,

    interior: null,
    returnPos: new THREE.Vector3(...PLAYER_SPAWN),
    returnYaw: 0,

    time: START_TIME,

    trains: initialTrainState(),
    trainSeat: null,
  };
}

/** Active focus point: the bike when riding, the player otherwise. */
export function getFocusPoint(world: GameWorld): THREE.Vector3 {
  return world.mode === "ride" ? world.bikePos : world.playerPos;
}
