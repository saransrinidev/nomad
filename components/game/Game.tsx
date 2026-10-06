// Game orchestrator (client-only). Owns the shared mutable GameWorld
// (held in a ref so the 60fps simulation never triggers React re-renders),
// the Canvas, discrete UI state (mode / prompts / speed), and the E-key
// mount/dismount flow. Per-frame simulation lives in the components and
// lib controllers — never in React state.

"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import World from "./World";
import Player from "./Player";
import Motorcycle from "./Motorcycle";
import Library from "./Library";
import Village from "./Village";
import ThirdPersonCamera from "./ThirdPersonCamera";
import GameHUD from "./GameHUD";
import BikePrompt from "./BikePrompt";
import Speedometer from "./Speedometer";
import Minimap from "./Minimap";
import PauseMenu from "./PauseMenu";
import SkidMarks from "./SkidMarks";
import GeoReadout from "./GeoReadout";
import { useKeyboardInput } from "@/lib/game/input";
import { ensureAudio, setAudioMuted } from "@/lib/game/audio";
import {
  BIKE_SPAWN,
  BIKE_SPAWN_YAW,
  FOG_COLOR,
  FOG_FAR,
  FOG_NEAR,
  INTERACT_DISTANCE,
  PLAYER_SPAWN,
  type RideMode,
} from "@/lib/game/gameConstants";
import { createInitialWorld, type GameWorld } from "@/lib/game/state";

/**
 * Runs inside the Canvas: proximity checks + low-frequency HUD sync.
 * Calls React state setters only when values actually change.
 */
function GameRig({
  worldRef,
  onNearBike,
  onSpeed,
}: {
  worldRef: RefObject<GameWorld>;
  onNearBike: (near: boolean) => void;
  onSpeed: (kmh: number) => void;
}) {
  const lastKmh = useRef(-1);
  const acc = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const world = worldRef.current;
    if (world.paused) return;

    if (world.mode === "walk") {
      const dx = world.playerPos.x - world.bikePos.x;
      const dz = world.playerPos.z - world.bikePos.z;
      const near = Math.hypot(dx, dz) < INTERACT_DISTANCE;
      if (near !== worldRef.current.nearBike) {
        worldRef.current.nearBike = near;
        onNearBike(near);
      }
    } else if (worldRef.current.nearBike) {
      worldRef.current.nearBike = false;
      onNearBike(false);
    }

    // Throttle speed HUD updates to ~8 Hz.
    acc.current += dt;
    if (acc.current > 0.12) {
      acc.current = 0;
      const speed =
        world.mode === "ride" ? Math.abs(world.bikeSpeed) : world.playerSpeed;
      const kmh = Math.round(speed * 3.6);
      if (kmh !== lastKmh.current) {
        lastKmh.current = kmh;
        onSpeed(kmh);
      }
    }
  });

  return null;
}

export default function Game() {
  const worldRef = useRef<GameWorld>(createInitialWorld());
  const [mode, setMode] = useState<RideMode>("walk");
  const [nearBike, setNearBike] = useState(false);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [camLocked, setCamLocked] = useState(false);
  const [mutedUi, setMutedUi] = useState(false);
  const [pausedUi, setPausedUi] = useState(false);
  const [mapNorthUp, setMapNorthUp] = useState(true);

  // Mirrors for the key handler (avoids stale closures).
  const modeRef = useRef<RideMode>("walk");
  const nearBikeRef = useRef(false);
  const mutedRef = useRef(false);
  const pausedRef = useRef(false);

  useKeyboardInput(worldRef);

  // Browsers require a user gesture before audio may start.
  useEffect(() => {
    const unlock = () => ensureAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const handleNearBike = useCallback((near: boolean) => {
    nearBikeRef.current = near;
    setNearBike(near);
  }, []);

  const handleLockChange = useCallback((locked: boolean) => {
    setCamLocked(locked);
  }, []);

  const setPaused = useCallback((p: boolean) => {
    pausedRef.current = p;
    worldRef.current.paused = p;
    setPausedUi(p);
  }, []);

  const toggleMute = useCallback(() => {
    const m = !mutedRef.current;
    mutedRef.current = m;
    setAudioMuted(m);
    setMutedUi(m);
  }, []);

  const handleRespawn = useCallback(() => {
    const w = worldRef.current;
    w.playerPos.set(...PLAYER_SPAWN);
    w.playerYaw = 0;
    w.playerVelY = 0;
    w.playerSpeed = 0;
    w.bikePos.set(...BIKE_SPAWN);
    w.bikeYaw = BIKE_SPAWN_YAW;
    w.bikeSpeed = 0;
    w.bikeSteer = 0;
    w.bikeVel.set(0, 0, 0);
    w.bikeDrift = false;
    modeRef.current = "walk";
    w.mode = "walk";
    setMode("walk");
    nearBikeRef.current = false;
    setNearBike(false);
    pausedRef.current = false;
    w.paused = false;
    setPausedUi(false);
  }, []);

  // E = mount / dismount, M = mute, ESC / P = pause menu.
  // (ESC while pointer-locked is consumed by the browser to exit the lock,
  // so P also toggles the menu.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM" && !e.repeat) {
        toggleMute();
        return;
      }
      if ((e.code === "Escape" || e.code === "KeyP") && !e.repeat) {
        if (e.code === "KeyP" && document.pointerLockElement) {
          document.exitPointerLock();
        }
        setPaused(!pausedRef.current);
        return;
      }
      if (e.code !== "KeyE" || e.repeat || pausedRef.current) return;
      const world = worldRef.current;
      if (modeRef.current === "ride") {
        // Dismount: place the rider beside the bike, facing its direction.
        const yaw = world.bikeYaw;
        world.playerPos.set(
          world.bikePos.x + Math.cos(yaw) * 1.5,
          0,
          world.bikePos.z - Math.sin(yaw) * 1.5,
        );
        world.playerYaw = yaw;
        world.playerVelY = 0;
        world.playerSpeed = 0;
        world.bikeDrift = false;
        modeRef.current = "walk";
        world.mode = "walk";
        setMode("walk");
      } else if (nearBikeRef.current) {
        world.bikeSpeed = 0;
        world.bikeVel.set(0, 0, 0);
        world.bikeDrift = false;
        modeRef.current = "ride";
        world.mode = "ride";
        setMode("ride");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMute, setPaused]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#bfe3f2] touch-none">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ fov: 55, near: 0.1, far: 4000, position: [0, 3.5, 7.5] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={[FOG_COLOR]} />
        <fog attach="fog" args={[FOG_COLOR, FOG_NEAR, FOG_FAR]} />
        <Suspense fallback={null}>
          <World worldRef={worldRef} />
          <Library />
          <Village />
          <Motorcycle worldRef={worldRef} />
          <Player worldRef={worldRef} />
          <ThirdPersonCamera worldRef={worldRef} onLockChange={handleLockChange} />
          <BikePrompt worldRef={worldRef} visible={nearBike && mode === "walk"} />
          <SkidMarks worldRef={worldRef} />
          <GameRig
            worldRef={worldRef}
            onNearBike={handleNearBike}
            onSpeed={setSpeedKmh}
          />
        </Suspense>
      </Canvas>

      <GameHUD mode={mode} speedKmh={speedKmh} camLocked={camLocked} muted={mutedUi} />
      <Speedometer worldRef={worldRef} speedKmh={speedKmh} visible={mode === "ride"} />
      <Minimap
        worldRef={worldRef}
        northUp={mapNorthUp}
        onToggleOrientation={() => setMapNorthUp((v) => !v)}
      />
      <GeoReadout worldRef={worldRef} />
      {/* Center crosshair while the cursor is captured in mouse-look */}
      {camLocked && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center select-none">
          <div className="h-1.5 w-1.5 rounded-full bg-white/90 shadow-[0_0_6px_rgba(0,0,0,0.8)]" />
        </div>
      )}
      {pausedUi && (
        <PauseMenu
          onResume={() => setPaused(false)}
          muted={mutedUi}
          onToggleMute={toggleMute}
          onRespawn={handleRespawn}
          mapNorthUp={mapNorthUp}
          onToggleMap={() => setMapNorthUp((v) => !v)}
        />
      )}
    </div>
  );
}
