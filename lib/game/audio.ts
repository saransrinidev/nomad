// Game audio: custom sound files with procedural fallback (Web Audio API).
//
// Drop your own files into public/sounds/ (mp3, ogg, wav or m4a):
//   step-walk.*    footstep while walking
//   step-run.*     footstep while running
//   engine-start.* one-shot crank/ignition played on mount
//   engine-loop.*  seamless engine loop (pitch follows RPM automatically)
// Natural aliases work too (e.g. bikestart.wav, run.ogg) — see CUSTOM_FILES.
// Anything missing falls back to the built-in synthesizer, so the game
// always has sound with or without custom files.

import { BIKE_MAX_SPEED } from "./gameConstants";

type CustomKey = "stepWalk" | "stepRun" | "engineStart" | "engineLoop";
// Accepted filenames per slot (any of .mp3/.ogg/.wav/.m4a). Name your files
// however feels natural — the first match wins.
const CUSTOM_FILES: Record<CustomKey, string[]> = {
  stepWalk: ["step-walk", "stepwalk", "step_walk", "walk", "footstep", "foot-step"],
  stepRun: ["step-run", "steprun", "step_run", "run"],
  engineStart: [
    "engine-start",
    "enginestart",
    "engine_start",
    "bike-start",
    "bikestart",
    "bike_start",
    "start",
    "ignition",
  ],
  engineLoop: ["engine-loop", "engineloop", "engine_loop", "engine", "loop", "idle"],
};
const CUSTOM_EXTS = [".mp3", ".ogg", ".wav", ".m4a"];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;

// Looping engine rig (created once, gain-gated).
let engOsc1: OscillatorNode | null = null;
let engOsc2: OscillatorNode | null = null;
let engFilter: BiquadFilterNode | null = null;
let engGain: GainNode | null = null;
let windFilter: BiquadFilterNode | null = null;
let windGain: GainNode | null = null;
let loopSrc: AudioBufferSourceNode | null = null;
let engineOn = false;
let startTimer = 0;
let wobbleT = 0;
let chugPhase = 0;

const customBuffers: Partial<Record<CustomKey, AudioBuffer>> = {};
let customLoadStarted = false;

async function loadCustomSounds() {
  const c = ctx;
  if (!c || customLoadStarted) return;
  customLoadStarted = true;
  const loaded: string[] = [];
  for (const [key, bases] of Object.entries(CUSTOM_FILES) as [CustomKey, string[]][]) {
    let found = false;
    for (const base of bases) {
      if (found) break;
      for (const ext of CUSTOM_EXTS) {
        try {
          const res = await fetch(`/sounds/${base}${ext}`);
          if (!res.ok) continue;
          customBuffers[key] = await c.decodeAudioData(await res.arrayBuffer());
          loaded.push(`${base}${ext}`);
          found = true;
          break;
        } catch {
          // Missing or undecodable — try the next name/extension.
        }
      }
    }
  }
  if (loaded.length > 0) console.info(`[audio] custom sounds loaded: ${loaded.join(", ")}`);
}

/** Create/resume the context. Idempotent — safe to call on every input. */
export function ensureAudio() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.4;
    master.connect(ctx.destination);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    engOsc1 = ctx.createOscillator();
    engOsc1.type = "sawtooth";
    engOsc1.frequency.value = 52;
    engOsc2 = ctx.createOscillator();
    engOsc2.type = "square";
    engOsc2.frequency.value = 26;
    engFilter = ctx.createBiquadFilter();
    engFilter.type = "lowpass";
    engFilter.frequency.value = 350;
    engFilter.Q.value = 2;
    engGain = ctx.createGain();
    engGain.gain.value = 0;
    engOsc1.connect(engFilter);
    engOsc2.connect(engFilter);
    engFilter.connect(engGain);
    engGain.connect(master);
    engOsc1.start();
    engOsc2.start();

    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuf;
    windSrc.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 800;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSrc.start();

    void loadCustomSounds();
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function setAudioMuted(m: boolean) {
  muted = m;
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.4, ctx.currentTime, 0.02);
}

function playCustomOneShot(key: CustomKey, volume: number, rate = 1): boolean {
  if (!ctx || !master) return false;
  const buf = customBuffers[key];
  if (!buf) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g);
  g.connect(master);
  src.start();
  return true;
}

/** Short footstep — custom sample if provided, else synthesized noise. */
export function playFootstep(running: boolean) {
  if (!ctx || !master || muted) return;
  if (
    playCustomOneShot(
      running ? "stepRun" : "stepWalk",
      0.55,
      (running ? 1.05 : 0.95) + Math.random() * 0.08,
    )
  ) {
    return;
  }
  if (!noiseBuf) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = (running ? 1.1 : 0.85) + Math.random() * 0.15;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value =
    (running ? 900 : 650) + Math.random() * (running ? 200 : 150);
  bp.Q.value = 1.1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(running ? 0.22 : 0.15, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, t + (running ? 0.08 : 0.11));
  src.connect(bp);
  bp.connect(g);
  g.connect(master);
  src.start(t, Math.random() * 0.8, 0.15);
  src.stop(t + 0.16);
}

/** Start the custom engine loop on first use; retires the oscillators. */
function ensureLoopNodes(): boolean {
  const c = ctx;
  if (!c || !engFilter || loopSrc) return loopSrc !== null;
  const buf = customBuffers.engineLoop;
  if (!buf || !master) return false;
  loopSrc = c.createBufferSource();
  loopSrc.buffer = buf;
  loopSrc.loop = true;
  loopSrc.playbackRate.value = 0.65;
  loopSrc.connect(engFilter);
  loopSrc.start();
  try {
    engOsc1?.stop();
  } catch {
    // Already stopped — the sample takes over regardless.
  }
  try {
    engOsc2?.stop();
  } catch {
    // Already stopped — the sample takes over regardless.
  }
  engOsc1 = null;
  engOsc2 = null;
  return true;
}

/**
 * Called every frame. Plays the custom ignition (or procedural sweep) on
 * mount, then tracks RPM — driving either the custom loop's playback rate
 * or the synthesized oscillators. Fades out on dismount. Wind stays
 * procedural.
 */
export function updateEngine(speed: number, riding: boolean, dt: number) {
  const c = ctx;
  const flt = engFilter;
  const eg = engGain;
  const wf = windFilter;
  const wg = windGain;
  if (!c || !flt || !eg || !wf || !wg) {
    if (!riding) engineOn = false;
    return;
  }
  if (riding && !engineOn) {
    engineOn = true;
    if (!playCustomOneShot("engineStart", 0.7)) startTimer = 0.6;
  }
  if (!riding) engineOn = false;

  const t = c.currentTime;
  const rpm = Math.min(Math.abs(speed) / BIKE_MAX_SPEED, 1);

  if (ensureLoopNodes() && loopSrc) {
    // Custom loop: pitch follows RPM, brightness follows RPM.
    loopSrc.playbackRate.setTargetAtTime(0.65 + rpm * 1.0, t, 0.05);
    flt.frequency.setTargetAtTime(400 + rpm * 3000, t, 0.05);
    eg.gain.setTargetAtTime(engineOn ? 0.12 + rpm * 0.1 : 0, t, 0.08);
  } else if (engOsc1 && engOsc2) {
    // Procedural fallback: Bullet-style thumper. Low growl with a
    // firing-rate "chug" that lopes at idle and smooths into a buzz at
    // speed. Dark lowpass keeps the energy in the bass.
    if (startTimer > 0) {
      startTimer = Math.max(0, startTimer - dt);
      const k = 1 - startTimer / 0.6;
      const freq = 30 + k * 70;
      engOsc1.frequency.setTargetAtTime(freq, t, 0.02);
      engOsc2.frequency.setTargetAtTime(freq * 0.5, t, 0.02);
      eg.gain.setTargetAtTime(0.1, t, 0.03);
    } else {
      wobbleT += dt;
      const firing = 8 + rpm * 40; // thumps/sec
      chugPhase += Math.PI * 2 * firing * dt;
      const chugDepth = 0.55 - rpm * 0.3;
      const chug = 1 - chugDepth * (0.5 + 0.5 * Math.sin(chugPhase));
      const freq = 40 + rpm * 170 + Math.sin(wobbleT * 23) * (1.5 + rpm * 3);
      engOsc1.frequency.setTargetAtTime(freq, t, 0.03);
      engOsc2.frequency.setTargetAtTime(freq * 0.5, t, 0.03);
      flt.frequency.setTargetAtTime(220 + rpm * 1400, t, 0.05);
      eg.gain.setTargetAtTime((engineOn ? 0.06 + rpm * 0.08 : 0) * chug, t, 0.01);
    }
  }

  wg.gain.setTargetAtTime(engineOn ? rpm * rpm * 0.14 : 0, t, 0.15);
  wf.frequency.setTargetAtTime(700 + rpm * 1600, t, 0.1);
}
