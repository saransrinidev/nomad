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
import Village from "./Village";
import Water from "./Water";
import Birds from "./Birds";
import ThirdPersonCamera from "./ThirdPersonCamera";
import GameHUD from "./GameHUD";
import BikePrompt from "./BikePrompt";
import DoorPrompt from "./DoorPrompt";
import Interior from "./Interior";
import Speedometer from "./Speedometer";
import Minimap from "./Minimap";
import BigMap from "./BigMap";
import PauseMenu from "./PauseMenu";
import SkidMarks from "./SkidMarks";
import GeoReadout from "./GeoReadout";
import Sky from "./Sky";
import Terrain from "./Terrain";
import { CanvasErrorBoundary, WebGLHelpScreen } from "./WebGLSupport";
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
import { formatTime, nightFactor } from "@/lib/game/map/time";
import { nearestDoor } from "@/lib/game/playerController";
import { BUILDING_DOORS, type BuildingType } from "@/lib/game/map/village";
import { INTERIOR_SPAWN, INTERIOR_THEMES } from "@/lib/game/map/interior";

/**
 * Runs inside the Canvas: proximity checks + low-frequency HUD sync.
 * Calls React state setters only when values actually change.
 */
function GameRig({
  worldRef,
  onNearBike,
  onNearDoor,
  onSpeed,
  onTime,
}: {
  worldRef: RefObject<GameWorld>;
  onNearBike: (near: boolean) => void;
  onNearDoor: (idx: number | null) => void;
  onSpeed: (kmh: number) => void;
  onTime: (label: string, night: boolean) => void;
}) {
  const lastKmh = useRef(-1);
  const lastClock = useRef("");
  const acc = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const world = worldRef.current;
    if (world.paused) return;

    if (world.mode === "walk" && world.interior === null) {
      const dx = world.playerPos.x - world.bikePos.x;
      const dz = world.playerPos.z - world.bikePos.z;
      const near = Math.hypot(dx, dz) < INTERACT_DISTANCE;
      if (near !== worldRef.current.nearBike) {
        worldRef.current.nearBike = near;
        onNearBike(near);
      }
      // Nearest enterable building door.
      const door = nearestDoor(world);
      if (door !== world.nearDoor) {
        world.nearDoor = door;
        onNearDoor(door);
      }
    } else {
      if (worldRef.current.nearBike) {
        worldRef.current.nearBike = false;
        onNearBike(false);
      }
      if (worldRef.current.nearDoor !== null) {
        worldRef.current.nearDoor = null;
        onNearDoor(null);
      }
    }

    // Throttle speed + clock HUD updates to ~8 Hz.
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
      const label = formatTime(world.time);
      if (label !== lastClock.current) {
        lastClock.current = label;
        onTime(label, nightFactor(world.time) > 0.5);
      }
    }
  });

  return null;
}

export default function Game() {
  const worldRef = useRef<GameWorld>(createInitialWorld());
  const [mode, setMode] = useState<RideMode>("walk");
  const [nearBike, setNearBike] = useState(false);
  const [nearDoor, setNearDoor] = useState<number | null>(null);
  const [interior, setInterior] = useState<BuildingType | null>(null);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [camLocked, setCamLocked] = useState(false);
  const [mutedUi, setMutedUi] = useState(false);
  const [pausedUi, setPausedUi] = useState(false);
  const [mapNorthUp, setMapNorthUp] = useState(true);
  const [mapOpen, setMapOpen] = useState(false);
  const mapOpenRef = useRef(false);
  // Renderer quality: a WebGL creation failure steps full → minimal (most
  // compatible context flags) → help screen, instead of crashing the page.
  const [glMode, setGlMode] = useState<"full" | "minimal" | "failed">("full");

  const handleCanvasError = useCallback(() => {
    setGlMode((m) => (m === "full" ? "minimal" : "failed"));
  }, []);
  const [engineUi, setEngineUi] = useState(true);
  const [lightsUi, setLightsUi] = useState(true);
  const [clockLabel, setClockLabel] = useState("08:00");
  const [isNight, setIsNight] = useState(false);

  // Mirrors for the key handler (avoids stale closures).
  const modeRef = useRef<RideMode>("walk");
  const nearBikeRef = useRef(false);
  const nearDoorRef = useRef<number | null>(null);
  const interiorRef = useRef<BuildingType | null>(null);
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

  const handleNearDoor = useCallback((idx: number | null) => {
    nearDoorRef.current = idx;
    setNearDoor(idx);
  }, []);

  const handleLockChange = useCallback((locked: boolean) => {
    setCamLocked(locked);
  }, []);

  const handleTime = useCallback((label: string, night: boolean) => {
    setClockLabel(label);
    setIsNight(night);
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

  // Fullscreen map: freeze the sim and swallow all keys while open.
  const openMap = useCallback(() => {
    const w = worldRef.current;
    w.keys.forward = false;
    w.keys.back = false;
    w.keys.left = false;
    w.keys.right = false;
    w.keys.run = false;
    w.keys.brake = false;
    w.paused = true;
    pausedRef.current = true;
    mapOpenRef.current = true;
    setMapOpen(true);
  }, []);

  const closeMap = useCallback(() => {
    mapOpenRef.current = false;
    setMapOpen(false);
    pausedRef.current = false;
    worldRef.current.paused = false;
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
    w.engineOn = true;
    setEngineUi(true);
    modeRef.current = "walk";
    w.mode = "walk";
    setMode("walk");
    interiorRef.current = null;
    w.interior = null;
    setInterior(null);
    nearBikeRef.current = false;
    setNearBike(false);
    nearDoorRef.current = null;
    w.nearDoor = null;
    setNearDoor(null);
    pausedRef.current = false;
    w.paused = false;
    setPausedUi(false);
  }, []);

  // E = mount / dismount, X = engine, L = lights, M = mute, ESC/P = pause.
  // (ESC while pointer-locked is consumed by the browser to exit the lock,
  // so P also toggles the menu.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM" && !e.repeat) {
        toggleMute();
        return;
      }
      if (e.code === "KeyL" && !e.repeat) {
        const w = worldRef.current;
        w.lightsOn = !w.lightsOn;
        setLightsUi(w.lightsOn);
        return;
      }
      if ((e.code === "Escape" || e.code === "KeyP") && !e.repeat) {
        if (mapOpenRef.current) {
          closeMap();
          return;
        }
        if (e.code === "KeyP" && document.pointerLockElement) {
          document.exitPointerLock();
        }
        setPaused(!pausedRef.current);
        return;
      }
      if (e.repeat || pausedRef.current) return;
      if (e.code === "KeyX") {
        // Kill switch: works seated or standing next to the bike.
        if (modeRef.current === "ride" || nearBikeRef.current) {
          const w = worldRef.current;
          w.engineOn = !w.engineOn;
          setEngineUi(w.engineOn);
        }
        return;
      }
      if (e.code !== "KeyE") return;
      const world = worldRef.current;

      // --- Building interiors: enter from a door, exit from inside. ---
      if (interiorRef.current !== null) {
        // Exit: restore the saved outdoor position, nudged just outside the door.
        world.playerPos.copy(world.returnPos);
        world.playerPos.z += 1.4; // step back out of the doorway
        world.playerYaw = world.returnYaw;
        world.playerSpeed = 0;
        world.playerVelY = 0;
        interiorRef.current = null;
        world.interior = null;
        setInterior(null);
        return;
      }
      if (modeRef.current === "walk" && nearDoorRef.current !== null) {
        const door = BUILDING_DOORS[nearDoorRef.current];
        // Remember where to come back to.
        world.returnPos.copy(world.playerPos);
        world.returnYaw = world.playerYaw;
        // Teleport into the room, facing in from the exit.
        world.playerPos.set(...INTERIOR_SPAWN);
        world.playerYaw = door.yaw;
        world.playerSpeed = 0;
        world.playerVelY = 0;
        world.nearDoor = null;
        nearDoorRef.current = null;
        setNearDoor(null);
        interiorRef.current = door.type;
        world.interior = door.type;
        setInterior(door.type);
        return;
      }

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
  }, [toggleMute, setPaused, closeMap]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#bfe3f2] touch-none">
      {glMode === "failed" ? (
        <WebGLHelpScreen onRetry={() => setGlMode("full")} />
      ) : (
        <CanvasErrorBoundary key={glMode} onError={handleCanvasError}>
          <Canvas
            shadows={glMode === "full"}
            dpr={glMode === "full" ? [1, 1.5] : 1}
            camera={{ fov: 55, near: 0.1, far: 4000, position: [0, 3.5, 7.5] }}
            gl={{
              // Minimal EGL requirements: no MSAA, no stencil/alpha buffers,
              // default adapter choice (a forced discrete GPU is a common
              // cause of EGL_NO_CONFIG on broken drivers), software fallback
              // explicitly allowed.
              antialias: glMode === "full",
              stencil: false,
              alpha: false,
              depth: true,
              failIfMajorPerformanceCaveat: false,
            }}
            style={{ width: "100%", height: "100%" }}
          >
        <color attach="background" args={[interior ? "#1a1a1a" : FOG_COLOR]} />
        {!interior && <fog attach="fog" args={[FOG_COLOR, FOG_NEAR, FOG_FAR]} />}
        <Suspense fallback={null}>
          {interior ? (
            // Interior scene: only the room, the player, and the camera.
            <Interior type={interior} />
          ) : (
            // Outdoor town scene.
            <>
              <World worldRef={worldRef} />
              <Terrain />
              <Sky worldRef={worldRef} />
              <Village />
              <Water worldRef={worldRef} />
              <Birds worldRef={worldRef} />
              <Motorcycle worldRef={worldRef} />
              <BikePrompt worldRef={worldRef} visible={nearBike && mode === "walk"} engineOn={engineUi} />
              <DoorPrompt worldRef={worldRef} visible={nearDoor !== null && mode === "walk"} />
              <SkidMarks worldRef={worldRef} />
            </>
          )}
          <Player worldRef={worldRef} />
          <ThirdPersonCamera worldRef={worldRef} onLockChange={handleLockChange} />
          <GameRig
            worldRef={worldRef}
            onNearBike={handleNearBike}
            onNearDoor={handleNearDoor}
            onSpeed={setSpeedKmh}
            onTime={handleTime}
          />
        </Suspense>
          </Canvas>
        </CanvasErrorBoundary>
      )}

      <GameHUD
        mode={mode}
        speedKmh={speedKmh}
        camLocked={camLocked}
        muted={mutedUi}
        clockLabel={clockLabel}
        isNight={isNight}
        engineOn={engineUi}
        lightsOn={lightsUi}
      />
      <Speedometer worldRef={worldRef} speedKmh={speedKmh} visible={mode === "ride"} />
      {!interior && (
        <>
          <Minimap
            worldRef={worldRef}
            northUp={mapNorthUp}
            onToggleOrientation={() => setMapNorthUp((v) => !v)}
            onOpenMap={openMap}
          />
          {mapOpen && (
            <BigMap worldRef={worldRef} northUp={mapNorthUp} onClose={closeMap} />
          )}
          <GeoReadout worldRef={worldRef} />
        </>
      )}

      {/* Interior banner + exit hint */}
      {interior && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex flex-col items-center gap-2 select-none">
          <div className="rounded-full border border-white/15 bg-black/60 px-5 py-2 text-base font-semibold tracking-wide text-white backdrop-blur-sm">
            {INTERIOR_THEMES[interior].title}
          </div>
          <div className="rounded-full bg-black/50 px-4 py-1 text-sm text-white/80 backdrop-blur-sm">
            Press <span className="font-mono text-amber-300">E</span> to exit
          </div>
        </div>
      )}
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
