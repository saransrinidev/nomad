// Game orchestrator (client-only). Owns the shared mutable GameWorld
// (held in a ref so the 60fps simulation never triggers React re-renders),
// the Canvas, discrete UI state (mode / prompts / speed), and the E-key
// mount/dismount flow. Per-frame simulation lives in the components and
// lib controllers — never in React state.

"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import Player from "./actors/Player";
import Motorcycle from "./vehicles/bike/Motorcycle";
import ThirdPersonCamera from "./cameras/ThirdPersonCamera";
import GameHUD from "./hud/GameHUD";
import BikePrompt from "./prompts/BikePrompt";
import Speedometer from "./hud/Speedometer";
import Minimap from "./hud/Minimap";
import BigMap from "./hud/BigMap";
import DistrictToast from "./hud/DistrictToast";
import PauseMenu from "./menus/PauseMenu";
import SkidMarks from "./scene/SkidMarks";
import GeoReadout from "./hud/GeoReadout";
import Sky from "./scene/Sky";
import Terrain from "./scene/Terrain";
import Ocean from "./scene/Ocean";
import Railway from "./scene/Railway";
import Train from "./vehicles/train/Train";
import TrainPrompt from "./prompts/TrainPrompt";
import { CanvasErrorBoundary, WebGLHelpScreen } from "./system/WebGLSupport";
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
import { useCurrentDistrict } from "@/lib/game/map/districts";
import { seatProximity } from "@/lib/game/map/railway";

/**
 * Runs inside the Canvas: proximity checks + low-frequency HUD sync.
 * Calls React state setters only when values actually change.
 */
function GameRig({
  worldRef,
  onNearBike,
  onSpeed,
  onTime,
}: {
  worldRef: RefObject<GameWorld>;
  onNearBike: (near: boolean) => void;
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

    if (world.mode === "walk") {
      const dx = world.playerPos.x - world.bikePos.x;
      const dz = world.playerPos.z - world.bikePos.z;
      const near = Math.hypot(dx, dz) < INTERACT_DISTANCE;
      if (near !== worldRef.current.nearBike) {
        worldRef.current.nearBike = near;
        onNearBike(near);
      }
    } else {
      if (worldRef.current.nearBike) {
        worldRef.current.nearBike = false;
        onNearBike(false);
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
  const district = useCurrentDistrict(worldRef);

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
    w.trainSeat = null;
    modeRef.current = "walk";
    w.mode = "walk";
    setMode("walk");
    nearBikeRef.current = false;
    setNearBike(false);
    pausedRef.current = false;
    w.paused = false;
    setPausedUi(false);
  }, []);

  // E = mount / dismount, X = engine, L = lights, M = map, N = mute,
  // ESC/P = pause. (ESC while pointer-locked is consumed by the browser to
  // exit the lock, so P also toggles the menu.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM" && !e.repeat) {
        // Toggle the fullscreen map — works on foot and while riding.
        // (openMap pauses the sim and clears inputs itself.)
        if (mapOpenRef.current) {
          closeMap();
          return;
        }
        if (pausedRef.current) return;
        openMap();
        return;
      }
      if (e.code === "KeyN" && !e.repeat) {
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
        // Pose toggle inside the train; kill switch everywhere else.
        if (modeRef.current === "train") {
          const seat = worldRef.current.trainSeat;
          if (seat) seat.lying = !seat.lying;
          return;
        }
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

      if (modeRef.current === "train") {
        // Stand up from the seat/berth (stay inside; walk out through a
        // doorway to leave — doors only open at stations).
        world.trainSeat = null;
        world.playerVelY = 0;
        world.playerSpeed = 0;
        modeRef.current = "walk";
        world.mode = "walk";
        setMode("walk");
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
      } else {
        // Sit or lie down at nearby coach furniture (seat wins over bike).
        const furn = seatProximity(world);
        if (furn) {
          world.trainSeat = { line: furn.line, car: furn.car, side: furn.side, lying: furn.kind === "berth" };
          world.playerSpeed = 0;
          world.playerVelY = 0;
          modeRef.current = "train";
          world.mode = "train";
          setMode("train");
        } else if (nearBikeRef.current) {
          world.bikeSpeed = 0;
          world.bikeVel.set(0, 0, 0);
          world.bikeDrift = false;
          modeRef.current = "ride";
          world.mode = "ride";
          setMode("ride");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMute, setPaused, openMap, closeMap]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#bfe3f2] touch-none">
      {glMode === "failed" ? (
        <WebGLHelpScreen onRetry={() => setGlMode("full")} />
      ) : (
        <CanvasErrorBoundary key={glMode} onError={handleCanvasError}>
          <Canvas
            shadows={glMode === "full"}
            dpr={glMode === "full" ? [1, 1.5] : 1}
            camera={{ fov: 55, near: 0.1, far: 24000, position: [0, 3.5, 7.5] }}
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
        <color attach="background" args={[FOG_COLOR]} />
        <fog attach="fog" args={[FOG_COLOR, FOG_NEAR, FOG_FAR]} />
        <Suspense fallback={null}>
          {/* Outdoor Tamil Nadu plain scene. */}
          <>
            <Terrain />
            <Ocean />
            <Sky worldRef={worldRef} />
            <Motorcycle worldRef={worldRef} />
            <BikePrompt worldRef={worldRef} visible={nearBike && mode === "walk"} engineOn={engineUi} />
            <SkidMarks worldRef={worldRef} />
            <Railway />
            <Train worldRef={worldRef} />
            <TrainPrompt worldRef={worldRef} />
          </>
          <Player worldRef={worldRef} />
          <ThirdPersonCamera worldRef={worldRef} onLockChange={handleLockChange} />
          <GameRig
            worldRef={worldRef}
            onNearBike={handleNearBike}
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
      <>
        <Minimap
          worldRef={worldRef}
          northUp={mapNorthUp}
          district={district}
          onToggleOrientation={() => setMapNorthUp((v) => !v)}
          onOpenMap={openMap}
        />
        {mapOpen && (
          <BigMap
            worldRef={worldRef}
            northUp={mapNorthUp}
            district={district}
            onClose={closeMap}
          />
        )}
        <GeoReadout worldRef={worldRef} />
        <DistrictToast district={district} />
      </>

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
