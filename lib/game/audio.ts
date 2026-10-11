// Game audio: custom sound files with procedural fallback (Web Audio API).
//
// Drop your own files into public/sounds/ (mp3, ogg, wav or m4a):
//   step-walk.*    footstep while walking
//   step-run.*     footstep while running
//   engine-start.* one-shot crank/ignition played on mount
//   engine-loop.*  seamless engine loop (pitch follows RPM automatically)
//   train-horn.*   train departure horn (else dual-tone synth)
//   train-loop.*   rolling rumble loop (pitch follows speed, else noise synth)
//   train-door.*   door slide/hiss (else filtered-noise synth)
// Natural aliases work too (e.g. bikestart.wav, run.ogg) — see CUSTOM_FILES.
// Anything missing falls back to the built-in synthesizer, so the game
// always has sound with or without custom files.

import { BIKE_MAX_SPEED } from "./gameConstants";
import { getLiveCars } from "./map/railway";
import type { GameWorld } from "./state";

type CustomKey =
  | "stepWalk"
  | "stepRun"
  | "engineStart"
  | "engineLoop"
  | "trainHorn"
  | "trainLoop"
  | "trainDoor";
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
  trainHorn: ["train-horn", "trainhorn", "train_horn", "horn", "train-whistle", "whistle"],
  trainLoop: ["train-loop", "trainloop", "train_loop", "train-rumble", "rumble", "rolling", "track"],
  trainDoor: ["train-door", "traindoor", "train_door", "door", "doors", "hiss"],
};
const CUSTOM_EXTS = [".mp3", ".ogg", ".wav", ".m4a"];

// --- Realistic distance attenuation ----------------------------------
// Every positional sound uses the same falloff: full volume up close,
// smooth quadratic fade as the player walks away, exactly silent past
// the source's hear distance (quadratic reads as natural loudness decay
// and guarantees distant sources cost no audibility, just like real air).
function distAtten(d: number, maxDist: number): number {
  const k = Math.max(0, 1 - d / maxDist);
  return k * k;
}

/** Bike idle/throttle carries across a platform, gone half a block away. */
const BIKE_HEAR_DIST = 35;
/** Rolling rumble fades fast (by ~15 m it is clearly quieter, gone by 100). */
const TRAIN_RUMBLE_DIST = 100;
/** Horns are loud — they carry across the whole station hall. */
const TRAIN_HORN_DIST = 250;
/** Door hiss is quiet — only audible on the platform. */
const TRAIN_DOOR_DIST = 50;

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
// Train rig (created once, gain-gated): rolling rumble + electric hum.
let trainNoiseSrc: AudioBufferSourceNode | null = null;
let trainRumbleFilter: BiquadFilterNode | null = null;
let trainRumbleGain: GainNode | null = null;
let trainHumOsc: OscillatorNode | null = null;
let trainHumGain: GainNode | null = null;
let trainLoopSrc: AudioBufferSourceNode | null = null;
let trainClickPhase = 0;
const prevTrainStopped = new Map<string, boolean>();
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
 * procedural. `dist` is the player→bike distance in meters (0 while
 * riding): the whole rig fades quadratically and is silent past
 * BIKE_HEAR_DIST, so a parked running bike goes quiet as you walk away.
 */
export function updateEngine(speed: number, riding: boolean, dt: number, dist = 0) {
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
  const att = distAtten(dist, BIKE_HEAR_DIST);

  if (ensureLoopNodes() && loopSrc) {
    // Custom loop: pitch follows RPM, brightness follows RPM.
    loopSrc.playbackRate.setTargetAtTime(0.65 + rpm * 1.0, t, 0.05);
    flt.frequency.setTargetAtTime(400 + rpm * 3000, t, 0.05);
    eg.gain.setTargetAtTime(engineOn ? (0.12 + rpm * 0.1) * att : 0, t, 0.08);
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
      eg.gain.setTargetAtTime(0.1 * att, t, 0.03);
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
      eg.gain.setTargetAtTime((engineOn ? 0.06 + rpm * 0.08 : 0) * chug * att, t, 0.01);
    }
  }

  wg.gain.setTargetAtTime(engineOn ? rpm * rpm * 0.14 * att : 0, t, 0.15);
  wf.frequency.setTargetAtTime(700 + rpm * 1600, t, 0.1);
}

// ---------------------------------------------------------- train SFX ---

const TRAIN_TOP_SPEED = 25; // mirrors TRAIN_SPEED in map/railway.ts

/** Create the persistent train rumble + hum rig (gain-gated). */
function ensureTrainNodes(): boolean {
  const c = ctx;
  if (!c || !master || !noiseBuf) return false;
  if (trainNoiseSrc && trainHumOsc) return true;
  try {
    trainNoiseSrc = c.createBufferSource();
    trainNoiseSrc.buffer = noiseBuf;
    trainNoiseSrc.loop = true;
    trainRumbleFilter = c.createBiquadFilter();
    trainRumbleFilter.type = "lowpass";
    trainRumbleFilter.frequency.value = 160;
    trainRumbleFilter.Q.value = 0.7;
    trainRumbleGain = c.createGain();
    trainRumbleGain.gain.value = 0;
    trainNoiseSrc.connect(trainRumbleFilter);
    trainRumbleFilter.connect(trainRumbleGain);
    trainRumbleGain.connect(master);
    trainNoiseSrc.start();

    trainHumOsc = c.createOscillator();
    trainHumOsc.type = "sawtooth";
    trainHumOsc.frequency.value = 55;
    const humFilter = c.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 240;
    trainHumGain = c.createGain();
    trainHumGain.gain.value = 0;
    trainHumOsc.connect(humFilter);
    humFilter.connect(trainHumGain);
    trainHumGain.connect(master);
    trainHumOsc.start();

    // Custom rolling loop, if provided, rides the same rumble fader.
    const buf = customBuffers.trainLoop;
    if (buf) {
      trainLoopSrc = c.createBufferSource();
      trainLoopSrc.buffer = buf;
      trainLoopSrc.loop = true;
      trainLoopSrc.playbackRate.value = 0.7;
      trainLoopSrc.connect(trainRumbleFilter);
      trainLoopSrc.start();
    }
  } catch {
    return false;
  }
  return true;
}

/** Indian-style dual-tone horn — custom sample if provided, else synth. */
export function playTrainHorn(volume = 0.6): void {
  if (!ctx || !master || muted) return;
  if (playCustomOneShot("trainHorn", Math.min(0.9, volume))) return;
  const c = ctx;
  const t = c.currentTime;
  const dur = 1.4;
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.05, volume * 0.5), t + 0.08);
  g.gain.setValueAtTime(Math.max(0.05, volume * 0.5), t + dur - 0.25);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  g.connect(master);
  for (const f of [349, 440]) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    const flt = c.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.value = 2200;
    o.connect(flt);
    flt.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** Door slide hiss — custom sample if provided, else filtered noise. */
export function playTrainDoor(volume = 0.4): void {
  if (!ctx || !master || muted || !noiseBuf) return;
  if (playCustomOneShot("trainDoor", Math.min(0.8, volume))) return;
  const c = ctx;
  const t = c.currentTime;
  const dur = 0.55;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 1.2;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3200;
  bp.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.03, volume * 0.35), t + 0.06);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(master);
  src.start(t, Math.random() * 0.5, dur + 0.05);
  src.stop(t + dur + 0.06);
}

/**
 * Called every frame from Train.tsx. Distance-attenuated rolling rumble +
 * clickety-clack that follows the nearest consist speed, a louder in-cabin
 * mix while riding, horn on departure and door hiss on dwell transitions.
 */
export function updateTrain(world: GameWorld, dt: number): void {
  const c = ctx;
  if (!c || !master || muted) return;
  if (world.paused) {
    if (trainRumbleGain) trainRumbleGain.gain.setTargetAtTime(0, c.currentTime, 0.1);
    if (trainHumGain) trainHumGain.gain.setTargetAtTime(0, c.currentTime, 0.1);
    return;
  }
  if (!ensureTrainNodes() || !trainRumbleGain || !trainHumGain || !trainRumbleFilter) return;

  const px = world.playerPos.x;
  const pz = world.playerPos.z;
  const riding = world.mode === "train";
  let minDist = Infinity;
  let nearSpeed = 0;
  let rideSpeed = 0;
  for (const t of world.trains) {
    const cars = getLiveCars(t.line);
    if (cars.length === 0) {
      const dx = t.x - px;
      const dz = t.z - pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < minDist) {
        minDist = d;
        nearSpeed = t.speed;
      }
      continue;
    }
    for (const car of cars) {
      const dx = car.x - px;
      const dz = car.z - pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < minDist) {
        minDist = d;
        nearSpeed = t.speed;
      }
    }
    if (riding && world.trainSeat && t.line === world.trainSeat.line) rideSpeed = t.speed;
  }
  if (minDist === Infinity) minDist = TRAIN_RUMBLE_DIST;

  const speedNorm = Math.min(Math.max(riding ? rideSpeed : nearSpeed, 0) / TRAIN_TOP_SPEED, 1);
  const proximity = riding ? 1 : distAtten(minDist, TRAIN_RUMBLE_DIST);
  const t = c.currentTime;

  // Clickety-clack: rail-joint thumps whose rate follows speed (~25 m rail).
  trainClickPhase += Math.PI * 2 * ((riding ? rideSpeed : nearSpeed) / 25) * dt * 2;
  const clickDepth = 0.45 * speedNorm;
  const click = 1 - clickDepth * (0.5 + 0.5 * Math.sin(trainClickPhase));
  const idleBed = riding ? 0.035 : 0;
  const rumbleTarget =
    proximity * (idleBed + speedNorm * 0.3 + (speedNorm > 0.02 ? 0.04 : 0)) * click;
  trainRumbleGain.gain.setTargetAtTime(rumbleTarget, t, 0.12);
  trainRumbleFilter.frequency.setTargetAtTime(120 + speedNorm * 420, t, 0.12);
  if (trainLoopSrc) trainLoopSrc.playbackRate.setTargetAtTime(0.7 + speedNorm * 0.9, t, 0.1);
  if (trainHumOsc && trainHumGain) {
    trainHumOsc.frequency.setTargetAtTime(50 + speedNorm * 45, t, 0.15);
    trainHumGain.gain.setTargetAtTime(proximity * (0.012 + speedNorm * 0.05), t, 0.15);
  }

  // Dwell transitions: horn + hiss on departure, hiss on arrival. Horns
  // carry far (250 m), door hiss only across the platform (50 m).
  for (const tr of world.trains) {
    const stopped = tr.wait > 0;
    const prev = prevTrainStopped.get(tr.line);
    if (prev !== undefined && prev !== stopped) {
      let d = TRAIN_HORN_DIST;
      const cars = getLiveCars(tr.line);
      for (const car of cars) {
        const dx = car.x - px;
        const dz = car.z - pz;
        const cd = Math.sqrt(dx * dx + dz * dz);
        if (cd < d) d = cd;
      }
      const isRiding = riding && world.trainSeat?.line === tr.line;
      const hornVol = isRiding ? 0.7 : distAtten(d, TRAIN_HORN_DIST) * 0.85;
      const doorVol = isRiding ? 0.55 : distAtten(d, TRAIN_DOOR_DIST) * 0.7;
      if (prev && !stopped) {
        // Departure: doors slide shut, then the horn.
        if (doorVol > 0.02) playTrainDoor(Math.max(0.12, doorVol));
        if (hornVol > 0.02) playTrainHorn(Math.max(0.15, hornVol));
      } else if (!prev && stopped) {
        // Arrival: doors open.
        if (doorVol > 0.02) playTrainDoor(Math.max(0.1, doorVol));
      }
    }
    prevTrainStopped.set(tr.line, stopped);
  }
}
