// Renderer quality: manual High/Low plus Auto mode with an FPS sampler
// that steps down when the device can't hold frame rate. Framework-free
// (no React) so the render loop can sample it; Game.tsx subscribes for
// the Canvas props. Level changes apply live (dpr/shadows) with no remount.

export type QualityLevel = "high" | "low";
export type QualityMode = "auto" | QualityLevel;

interface QualityState {
  mode: QualityMode;
  level: QualityLevel;
}

const state: QualityState = { mode: "auto", level: "high" };
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function getQuality(): QualityState {
  return { ...state };
}

export function subscribeQuality(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Manual override from the pause menu. Manual High/Low applies at once. */
export function setQualityMode(mode: QualityMode): void {
  state.mode = mode;
  if (mode !== "auto" && state.level !== mode) {
    state.level = mode;
    resetSampler();
    notify();
  } else if (mode === "auto") {
    resetSampler();
    notify();
  }
}

// --- Auto sampler (call once per frame with real delta seconds) ---

const WINDOW = 2.5; // evaluate every 2.5 s
const DOWN_FPS = 38; // step down below this
const UP_FPS = 55; // consider stepping up above this (3 windows in a row)
const COOLDOWN = 5; // quiet period after a change

let acc = 0;
let n = 0;
// Start in cooldown so shader-compile jank in the first seconds never
// triggers a false step-down right after load.
let cool = COOLDOWN;
let upStreak = 0;

export function resetSampler(): void {
  acc = 0;
  n = 0;
  cool = COOLDOWN;
  upStreak = 0;
}

/** Returns the active level (cheap: call every frame from GameRig). */
export function sampleQuality(dt: number): QualityLevel {
  if (state.mode !== "auto") return state.level;
  if (dt <= 0 || dt > 0.5) return state.level; // ignore pauses/hitches
  if (cool > 0) {
    cool -= dt;
    return state.level;
  }
  acc += dt;
  n++;
  if (acc < WINDOW) return state.level;
  const fps = n / acc;
  acc = 0;
  n = 0;
  if (state.level === "high" && fps < DOWN_FPS) {
    state.level = "low";
    upStreak = 0;
    cool = COOLDOWN;
    notify();
  } else if (state.level === "low" && fps > UP_FPS) {
    upStreak++;
    if (upStreak >= 3) {
      state.level = "high";
      upStreak = 0;
      cool = COOLDOWN;
      notify();
    }
  } else {
    upStreak = 0;
  }
  return state.level;
}
