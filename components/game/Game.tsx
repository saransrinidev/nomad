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
import SpawnMenu from "./menus/SpawnMenu";
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
import LoadingScene from "./system/LoadingScene";
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
  SPAWN_POINTS,
  type RideMode,
} from "@/lib/game/gameConstants";
import { createInitialWorld, type GameWorld, type KeyState } from "@/lib/game/state";
import { formatTime, nightFactor } from "@/lib/game/map/time";
import { latLonToGame } from "@/lib/game/map/tamilnadu";
import { buildTerrainAsync, groundHeight } from "@/lib/game/map/terrain";
import {
  getQuality,
  sampleQuality,
  setQualityMode,
  subscribeQuality,
  type QualityMode,
} from "@/lib/game/quality";
import { useCurrentDistrict } from "@/lib/game/map/districts";
import { clearGroundSpot, seatProximity } from "@/lib/game/map/railway";

/**
 * Runs inside the Canvas: proximity checks + low-frequency HUD sync.
 * Calls React state setters only when values actually change.
 */
function GameRig({
  worldRef,
  onNearBike,
  onSpeed,
  onTime,
  onMode,
}: {
  worldRef: RefObject<GameWorld>;
  onNearBike: (near: boolean) => void;
  onSpeed: (kmh: number) => void;
  onTime: (label: string, night: boolean) => void;
  onMode: (m: RideMode) => void;
}) {
  const lastKmh = useRef(-1);
  const lastClock = useRef("");
  const lastMode = useRef<RideMode>("walk");
  const acc = useRef(0);

  useFrame((_, rawDt) => {
    // FPS sampler for Auto quality (no-ops unless mode is auto).
    sampleQuality(rawDt);
    const dt = Math.min(rawDt, 0.05);
    const world = worldRef.current;
    if (world.paused) return;

    // Mode can flip inside the sim (bike crash ejects the rider) — mirror
    // it into React state so HUD/prompts follow.
    if (world.mode !== lastMode.current) {
      lastMode.current = world.mode;
      onMode(world.mode);
    }

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
  // World is created after the async terrain build so the loading scene can
  // paint progress (creating it eagerly would block on the sync build).
  // Nothing that touches worldRef mounts until worldReady is set.
  const worldRef = useRef<GameWorld>(null!);
  const [loadPct, setLoadPct] = useState(0);
  const [worldReady, setWorldReady] = useState(false);
  const [presented, setPresented] = useState(false);
  const [mode, setMode] = useState<RideMode>("walk");
  const [nearBike, setNearBike] = useState(false);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [camLocked, setCamLocked] = useState(false);
  const [mutedUi, setMutedUi] = useState(false);
  const [pausedUi, setPausedUi] = useState(false);
  const [mapNorthUp, setMapNorthUp] = useState(true);
  const [mapOpen, setMapOpen] = useState(false);
  const mapOpenRef = useRef(false);
  // Testing-mode spawn picker (TAB): same pause/restore treatment as the map.
  const [spawnOpen, setSpawnOpen] = useState(false);
  const spawnOpenRef = useRef(false);
  // Snapshot of held keys + pointer-lock (CTRL look) taken when the map
  // opens, restored when it closes.
  const savedKeysRef = useRef<KeyState | null>(null);
  const wasLockedRef = useRef(false);
  // Renderer quality: a WebGL creation failure steps full → minimal (most
  // compatible context flags) → help screen, instead of crashing the page.
  const [glMode, setGlMode] = useState<"full" | "minimal" | "failed">("full");
  // Perf quality: High = current visuals, Low = dpr 1 + no MSAA + no
  // shadows. Auto samples FPS and steps down/up (remounts Canvas rarely).
  const [quality, setQuality] = useState(getQuality);
  useEffect(
    () => subscribeQuality(() => setQuality(getQuality())),
    [],
  );

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

  // Boot: build the heightfield in slices (progress paints), create the
  // world, then mount the scene. The overlay stays up through first-frame
  // shader compile (see Canvas onCreated) so no blank frame ever shows.
  useEffect(() => {
    let cancelled = false;
    buildTerrainAsync((p) => {
      if (!cancelled) setLoadPct(Math.round(p * 100));
    }).then(() => {
      if (cancelled) return;
      if (worldRef.current == null) worldRef.current = createInitialWorld();
      setWorldReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleModeSync = useCallback((m: RideMode) => {
    modeRef.current = m;
    setMode(m);
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

  // Fullscreen map: freeze the sim, remember held keys + CTRL
  // pointer-lock, and hand the cursor back (exit lock) so the map is
  // clickable. closeMap restores everything.
  const openMap = useCallback(() => {
    const w = worldRef.current;
    if (!w || mapOpenRef.current) return;
    savedKeysRef.current = { ...w.keys };
    w.keys.forward = false;
    w.keys.back = false;
    w.keys.left = false;
    w.keys.right = false;
    w.keys.run = false;
    w.keys.brake = false;
    wasLockedRef.current = document.pointerLockElement != null;
    if (document.pointerLockElement) document.exitPointerLock();
    w.paused = true;
    w.mapOpen = true;
    pausedRef.current = true;
    mapOpenRef.current = true;
    setMapOpen(true);
  }, []);

  const closeMap = useCallback(() => {
    if (!mapOpenRef.current) return;
    mapOpenRef.current = false;
    setMapOpen(false);
    const w = worldRef.current;
    if (w) {
      if (savedKeysRef.current) {
        w.keys.forward = savedKeysRef.current.forward;
        w.keys.back = savedKeysRef.current.back;
        w.keys.left = savedKeysRef.current.left;
        w.keys.right = savedKeysRef.current.right;
        w.keys.run = savedKeysRef.current.run;
        w.keys.brake = savedKeysRef.current.brake;
        savedKeysRef.current = null;
      }
      w.mapOpen = false;
      w.paused = false;
    }
    pausedRef.current = false;
    if (wasLockedRef.current) {
      wasLockedRef.current = false;
      // Handled in ThirdPersonCamera (it owns the canvas element).
      // Dispatched synchronously inside this user gesture (M / ESC / click)
      // so requestPointerLock still has transient activation.
      window.dispatchEvent(new Event("nomad:relock"));
    }
  }, []);

  // Testing-mode spawn picker: freeze the sim + free the cursor exactly
  // like the map so the button list is clickable, then restore on close.
  const openSpawn = useCallback(() => {
    const w = worldRef.current;
    if (!w || spawnOpenRef.current) return;
    savedKeysRef.current = { ...w.keys };
    w.keys.forward = false;
    w.keys.back = false;
    w.keys.left = false;
    w.keys.right = false;
    w.keys.run = false;
    w.keys.brake = false;
    wasLockedRef.current = document.pointerLockElement != null;
    if (document.pointerLockElement) document.exitPointerLock();
    w.paused = true;
    w.spawnOpen = true;
    pausedRef.current = true;
    spawnOpenRef.current = true;
    setSpawnOpen(true);
  }, []);

  const closeSpawn = useCallback(() => {
    if (!spawnOpenRef.current) return;
    spawnOpenRef.current = false;
    setSpawnOpen(false);
    const w = worldRef.current;
    if (w) {
      if (savedKeysRef.current) {
        w.keys.forward = savedKeysRef.current.forward;
        w.keys.back = savedKeysRef.current.back;
        w.keys.left = savedKeysRef.current.left;
        w.keys.right = savedKeysRef.current.right;
        w.keys.run = savedKeysRef.current.run;
        w.keys.brake = savedKeysRef.current.brake;
        savedKeysRef.current = null;
      }
      w.spawnOpen = false;
      w.paused = false;
    }
    pausedRef.current = false;
    if (wasLockedRef.current) {
      wasLockedRef.current = false;
      window.dispatchEvent(new Event("nomad:relock"));
    }
  }, []);

  // Teleport the player + bike together to a spawn point (always on foot,
  // on open district land clear of every rail), then close the picker.
  const handleSpawnPoint = useCallback(
    (index: number) => {
      const p = SPAWN_POINTS[index];
      const w = worldRef.current;
      if (!p || !w) return;
      const g = latLonToGame(p.lon, p.lat);
      const clearP = clearGroundSpot(g.x + 20, g.z);
      w.playerPos.set(clearP.x, 0, clearP.z);
      w.playerPos.y = groundHeight(w.playerPos.x, w.playerPos.z);
      w.playerYaw = 0;
      w.playerVelY = 0;
      w.playerSpeed = 0;
      w.playerMoving = false;
      w.crashFlying = false;
      w.stun = 0;
      const clearB = clearGroundSpot(g.x + 23.5, g.z + 2.5, 20);
      w.bikePos.set(clearB.x, 0, clearB.z);
      w.bikePos.y = groundHeight(w.bikePos.x, w.bikePos.z);
      w.bikeYaw = BIKE_SPAWN_YAW;
      w.bikeSpeed = 0;
      w.bikeSteer = 0;
      w.bikeVel.set(0, 0, 0);
      w.bikeDrift = false;
      w.trainSeat = null;
      modeRef.current = "walk";
      w.mode = "walk";
      setMode("walk");
      closeSpawn();
    },
    [closeSpawn],
  );

  const handleRespawn = useCallback(() => {
    const w = worldRef.current;
    const clearP = clearGroundSpot(PLAYER_SPAWN[0], PLAYER_SPAWN[2]);
    w.playerPos.set(clearP.x, 0, clearP.z);
    w.playerPos.y = groundHeight(w.playerPos.x, w.playerPos.z);
    w.playerYaw = 0;
    w.playerVelY = 0;
    w.playerSpeed = 0;
    const clearB = clearGroundSpot(BIKE_SPAWN[0], BIKE_SPAWN[2], 20);
    w.bikePos.set(clearB.x, 0, clearB.z);
    w.bikePos.y = groundHeight(w.bikePos.x, w.bikePos.z);
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

  // E = mount / dismount, X = engine, L = lights, M = map, TAB = spawn
  // picker, N = mute, ESC/P = pause. (ESC while pointer-locked is consumed
  // by the browser to exit the lock, so P also toggles the menu.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!worldRef.current) return;
      if (e.code === "Tab" && !e.repeat) {
        // Testing-mode spawn picker — works on foot and while riding.
        e.preventDefault();
        if (spawnOpenRef.current) {
          closeSpawn();
          return;
        }
        if (pausedRef.current || mapOpenRef.current) return;
        openSpawn();
        return;
      }
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
        if (spawnOpenRef.current) {
          closeSpawn();
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
  }, [toggleMute, setPaused, openMap, closeMap, openSpawn, closeSpawn]);

  const lowQ = quality.level === "low";

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#bfe3f2] touch-none">
      {!presented && <LoadingScene pct={worldReady ? 100 : loadPct} />}
      {glMode === "failed" ? (
        <WebGLHelpScreen onRetry={() => setGlMode("full")} />
      ) : worldReady ? (
        <CanvasErrorBoundary key={glMode} onError={handleCanvasError}>
          <Canvas
            // Remount only on glMode change: a fresh context is required to
            // apply antialias toggles after a real WebGL failure (rare).
            // Quality level (dpr/shadows) is applied live by R3F with no
            // remount — remounting here caused the white/blank flash.
            key={glMode}
            shadows={glMode === "full" && !lowQ}
            dpr={glMode === "full" && !lowQ ? [1, 1.5] : 1}
            camera={{ fov: 55, near: 0.1, far: 9000, position: [0, 3.5, 7.5] }}
            gl={{
              // Minimal EGL requirements: no MSAA, no stencil/alpha buffers,
              // default adapter choice (a forced discrete GPU is a common
              // cause of EGL_NO_CONFIG on broken drivers), software fallback
              // explicitly allowed.
              antialias: glMode === "full" && !lowQ,
              stencil: false,
              alpha: false,
              depth: true,
              failIfMajorPerformanceCaveat: false,
            }}
            style={{ width: "100%", height: "100%" }}
            onCreated={() => {
              // Hide the loader only once frames are actually presenting,
              // covering first-frame shader-compile jank.
              requestAnimationFrame(() =>
                requestAnimationFrame(() => setPresented(true)),
              );
            }}
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
            <Railway worldRef={worldRef} />
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
            onMode={handleModeSync}
          />
        </Suspense>
          </Canvas>
        </CanvasErrorBoundary>
      ) : null}

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
      {worldReady && (
        <>
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
            {spawnOpen && (
              <SpawnMenu onSpawn={handleSpawnPoint} onClose={closeSpawn} />
            )}
            <GeoReadout worldRef={worldRef} />
            <DistrictToast district={district} />
          </>
        </>
      )}

      {/* Center crosshair removed: no white dot in mouse-look (CTRL).
      The top-center badge still shows when mouse-look is active. */}
      {pausedUi && (
        <PauseMenu
          onResume={() => setPaused(false)}
          muted={mutedUi}
          onToggleMute={toggleMute}
          onRespawn={handleRespawn}
          mapNorthUp={mapNorthUp}
          onToggleMap={() => setMapNorthUp((v) => !v)}
          qualityMode={quality.mode}
          onQualityMode={(m: QualityMode) => setQualityMode(m)}
        />
      )}
    </div>
  );
}
