"use strict";
// Shared mutable game state.
// A single plain object (created once in Game.tsx) is passed by reference
// to every 3D component. Rapidly changing values (positions, speeds) live
// here in refs/fields so the render loop never triggers React re-renders.
// Discrete UI state (mode, prompts) is mirrored to React state at low
// frequency by GameRig. This layout maps 1:1 to future multiplayer snapshots.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptyKeys = createEmptyKeys;
exports.createInitialWorld = createInitialWorld;
exports.getFocusPoint = getFocusPoint;
const THREE = __importStar(require("three"));
const gameConstants_1 = require("./gameConstants");
const time_1 = require("./map/time");
function createEmptyKeys() {
    return {
        forward: false,
        back: false,
        left: false,
        right: false,
        run: false,
        brake: false,
    };
}
function createInitialWorld() {
    return {
        mode: "walk",
        keys: createEmptyKeys(),
        paused: false,
        playerPos: new THREE.Vector3(...gameConstants_1.PLAYER_SPAWN),
        playerYaw: 0,
        playerVelY: 0,
        playerSpeed: 0,
        playerMoving: false,
        playerRunning: false,
        walkPhase: 0,
        bikePos: new THREE.Vector3(...gameConstants_1.BIKE_SPAWN),
        bikeYaw: gameConstants_1.BIKE_SPAWN_YAW,
        bikeSpeed: 0,
        bikeSteer: 0,
        bikeVel: new THREE.Vector3(),
        bikeDrift: false,
        engineOn: true,
        lightsOn: true,
        wheelSpin: 0,
        camYaw: Math.PI,
        camPitch: 0.32,
        camDistance: gameConstants_1.CAM_DISTANCE,
        camManualZoom: false,
        nearBike: false,
        nearDoor: null,
        interior: null,
        returnPos: new THREE.Vector3(...gameConstants_1.PLAYER_SPAWN),
        returnYaw: 0,
        time: time_1.START_TIME,
    };
}
/** Active focus point: the bike when riding, the player otherwise. */
function getFocusPoint(world) {
    return world.mode === "ride" ? world.bikePos : world.playerPos;
}
