// Player — movement controller + pose driver for the PlayerCharacter rig.
// Visuals live in PlayerCharacter.tsx (swappable); this file only reads
// world state and writes joint rotations. Seated offsets are retuned for the
// 1.75 m rig (hip 0.92): saddle +0.04, train seat −0.86.

"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import PlayerCharacter, { type CharacterRig } from "./PlayerCharacter";
import { surfaceY, updateOnFoot } from "@/lib/game/playerController";
import { bikeLeanAngle } from "@/lib/game/bikeController";
import { berthAnchor, getLiveCars, seatAnchor } from "@/lib/game/map/railway";
import { groundHeight } from "@/lib/game/map/terrain";
import { playFootstep } from "@/lib/game/audio";
import type { GameWorld } from "@/lib/game/state";
import type { RideMode } from "@/lib/game/gameConstants";

const lerp = THREE.MathUtils.lerp;

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

// Seated pose shared by riding + mount blending + train sitting.
// Solved from the bike anchors (seat top ~0.91, pegs ±0.28/0.36, grips
// ±0.36/1.12) for the 1.75 m rig: butt on the saddle, shins to the pegs,
// hands just reaching the grips with soft elbows.
const SIT = {
  thighX: -0.9,
  kneeX: 0.75,
  uaX: -0.95,
  elX: -0.2,
  headX: 0,
};

export default function Player({ worldRef }: { worldRef: RefObject<GameWorld> }) {
  const rig = useRef<CharacterRig | null>(null);
  const lastStep = useRef(-1);
  const tumble = useRef(0);
  const landDip = useRef(0);
  const wasAirborne = useRef(false);
  // 0 at standstill → 1 in full stride. Eases out on stop so the legs settle
  // back to a symmetric stance instead of freezing mid-step.
  const stride = useRef(0);
  const mount = useRef({
    t: 1,
    fromPos: new THREE.Vector3(),
    fromYaw: 0,
    lastMode: "walk" as RideMode,
  });
  const saddle = useRef(new THREE.Vector3());

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const world = worldRef.current;
    const R = rig.current;
    if (world.paused || !R) return;
    const M = mount.current;

    // Torso stays upright; only the arms reach out (sprint adds a slight tuck).
    const leanTarget = world.mode === "ride" ? 0 : world.playerRunning ? 0.1 : 0;
    R.lean.rotation.x += (leanTarget - R.lean.rotation.x) * Math.min(1, dt * 8);

    // Roll with the bike: rider and machine lean equally into turns.
    const rollTarget = world.mode === "ride" ? bikeLeanAngle(world) : 0;
    R.lean.rotation.z += (rollTarget - R.lean.rotation.z) * Math.min(1, dt * 8);

    if (world.mode === "train") {
      // Riding inside a coach: root pinned to the seat/berth anchor, which
      // tracks the moving consist every frame (Train ticks before Player).
      const seat = world.trainSeat;
      const cars = seat ? getLiveCars(seat.line) : [];
      const car = seat ? cars[seat.car] : undefined;
      if (seat && car) {
        const gy = groundHeight(car.x, car.z);
        const tr = world.trains.find((t) => t.line === seat.line);
        const tdir = tr ? tr.dir : 1;
        if (!seat.lying) {
          const a = seatAnchor(seat.line, seat.car, seat.side, tdir);
          if (a) {
            R.root.position.set(a.x, gy + a.y - 0.86, a.z);
            R.root.rotation.set(0, a.yaw, 0);
            // Mirror into world state so the camera, maps, and prompts
            // travel with the rider (Train ticks before Player).
            world.playerPos.set(a.x, gy + a.y - 0.86, a.z);
            world.playerYaw = a.yaw;
          }
          R.lean.rotation.x = 0;
          R.lean.rotation.y = 0;
          // Seated: thighs forward, shins down, hands resting on lap.
          R.thighL.rotation.set(-1.35, 0, -0.05);
          R.thighR.rotation.set(-1.35, 0, 0.05);
          R.kneeL.rotation.set(1.35, 0, 0);
          R.kneeR.rotation.set(1.35, 0, 0);
          R.upperArmL.rotation.set(-0.35, 0, 0.06);
          R.upperArmR.rotation.set(-0.35, 0, -0.06);
          R.elbowL.rotation.set(-0.6, 0, 0);
          R.elbowR.rotation.set(-0.6, 0, 0);
          R.head.rotation.set(0, 0, 0);
        } else {
          const a = berthAnchor(seat.line, seat.car, tdir);
          if (a) {
            R.root.position.set(a.x, gy + a.y, a.z);
            R.root.rotation.set(0, a.yaw, 0);
            world.playerPos.set(a.x, gy + a.y, a.z);
            world.playerYaw = a.yaw;
          }
          // Lying: whole body pitched flat, limbs relaxed straight.
          R.lean.rotation.x = -Math.PI / 2 + 0.12;
          R.lean.rotation.y = 0;
          R.thighL.rotation.set(-0.08, 0, 0);
          R.thighR.rotation.set(-0.08, 0, 0);
          R.kneeL.rotation.set(0.05, 0, 0);
          R.kneeR.rotation.set(0.05, 0, 0);
          R.upperArmL.rotation.set(-0.15, 0, 0.06);
          R.upperArmR.rotation.set(-0.15, 0, -0.06);
          R.elbowL.rotation.set(-0.2, 0, 0);
          R.elbowR.rotation.set(-0.2, 0, 0);
          R.head.rotation.set(0, 0, 0);
        }
      }
      M.lastMode = "train";
      M.t = 1;
      stride.current = 0;
      world.playerSpeed = 0;
      world.playerMoving = false;
      world.playerVelY = 0;
      return;
    }

    if (world.mode === "walk") {
      if (M.lastMode !== "walk") {
        // Dismount: ease from the saddle to the placed standing spot.
        M.lastMode = "walk";
        M.t = 0;
        M.fromPos.copy(R.root.position);
        M.fromYaw = R.root.rotation.y;
      }
      updateOnFoot(world, dt);
      M.t = Math.min(1, M.t + dt / 0.35);
      const s = smooth(M.t);

      if (world.crashFlying) {
        // Ragdoll flight: tumbling body with paddling limbs (walkPhase runs
        // fast during flight — see updateCrashFlight).
        const ph = world.walkPhase;
        tumble.current += world.crashSpin * dt;
        // Lift the root while inverted so the sweeping head/hands never clip
        // below ground: full lift at upside-down, zero when upright.
        const lift = (1 - Math.cos(tumble.current)) * 0.85;
        R.root.position.set(
          world.playerPos.x,
          world.playerPos.y + lift,
          world.playerPos.z,
        );
        R.root.rotation.set(tumble.current, world.playerYaw, 0);
        R.lean.rotation.x = 0;
        R.lean.rotation.y = 0;
        R.thighL.rotation.set(Math.sin(ph) * 0.9 - 0.2, 0, -0.15);
        R.thighR.rotation.set(Math.sin(ph + Math.PI) * 0.9 - 0.2, 0, 0.15);
        R.kneeL.rotation.set(0.6 + Math.abs(Math.cos(ph)) * 0.7, 0, 0);
        R.kneeR.rotation.set(0.6 + Math.abs(Math.cos(ph + Math.PI)) * 0.7, 0, 0);
        R.upperArmL.rotation.set(Math.sin(ph + Math.PI) * 1.4 - 0.4, 0, 1.0);
        R.upperArmR.rotation.set(Math.sin(ph) * 1.4 - 0.4, 0, -1.0);
        R.elbowL.rotation.set(-0.4, 0, 0);
        R.elbowR.rotation.set(-0.4, 0, 0);
        R.head.rotation.set(Math.sin(ph * 0.7) * 0.2, 0, Math.sin(ph * 0.5) * 0.15);
        wasAirborne.current = true;
        return;
      }

      // Settle the tumble to the nearest upright turn (not zero, which may
      // be a full flip away) and keep the anti-clip lift until upright.
      const upright = Math.round(tumble.current / (Math.PI * 2)) * Math.PI * 2;
      tumble.current += (upright - tumble.current) * Math.min(1, dt * 6);
      const lift = (1 - Math.cos(tumble.current)) * 0.85;

      // Airborne (jump) vs grounded; landing triggers a crouch dip.
      const airborne =
        world.playerPos.y -
          surfaceY(world.playerPos.x, world.playerPos.z, world.playerPos.y) >
        0.15;
      if (wasAirborne.current && !airborne) landDip.current = 0.9;
      wasAirborne.current = airborne;
      landDip.current += (0 - landDip.current) * Math.min(1, dt * 7);
      const dip = landDip.current;
      const stunned = world.stun > 0;
      const stunK = Math.min(1, world.stun);

      // Dazed side-sway while stunned.
      const t = performance.now() / 1000;
      const sway = stunned ? Math.sin(t * 4.5) * 0.07 * stunK : 0;

      // Blend saddle→standing briefly after dismount, then track exactly.
      if (s < 1) R.root.position.lerpVectors(M.fromPos, world.playerPos, s);
      else R.root.position.copy(world.playerPos);
      R.root.rotation.set(
        tumble.current,
        s < 1 ? lerpAngle(M.fromYaw, world.playerYaw, s) : world.playerYaw,
        sway,
      );

      // Footstep on each half walk-cycle.
      const stepIndex = Math.floor(world.walkPhase / Math.PI);
      if (world.playerMoving && stepIndex !== lastStep.current) {
        lastStep.current = stepIndex;
        playFootstep(world.playerRunning);
      } else if (!world.playerMoving) {
        lastStep.current = stepIndex;
      }

      if (airborne) {
        // Jump tuck: knees up, arms thrown upward.
        R.thighL.rotation.set(-0.7, 0, -0.08);
        R.thighR.rotation.set(-0.7, 0, 0.08);
        R.kneeL.rotation.set(1.2, 0, 0);
        R.kneeR.rotation.set(1.2, 0, 0);
        R.upperArmL.rotation.set(-2.2, 0, 0.3);
        R.upperArmR.rotation.set(-2.2, 0, -0.3);
        R.elbowL.rotation.set(-0.3, 0, 0);
        R.elbowR.rotation.set(-0.3, 0, 0);
        R.head.rotation.set(-0.1, 0, 0);
      } else {
        // Walk cycle with knee flexion + torso sway + landing crouch.
        // Stride eases in/out so stopping settles into a symmetric stance.
        stride.current +=
          ((world.playerMoving ? 1 : 0) - stride.current) * Math.min(1, dt * 6);
        const st = stride.current;
        const runK = world.playerRunning ? 1 : 0;
        const A = st * (world.playerRunning ? 0.75 : 0.55);
        const sw = Math.sin(world.walkPhase) * A;
        R.thighL.rotation.set(sw + dip * 0.6, 0, 0);
        R.thighR.rotation.set(-sw + dip * 0.6, 0, 0);
        R.kneeL.rotation.set(
          0.06 + st * Math.max(0, Math.cos(world.walkPhase)) * (0.7 + runK * 0.3) + dip * 0.9,
          0,
          0,
        );
        R.kneeR.rotation.set(
          0.06 + st * Math.max(0, -Math.cos(world.walkPhase)) * (0.7 + runK * 0.3) + dip * 0.9,
          0,
          0,
        );
        R.upperArmL.rotation.set(
          -sw * 1.0 + Math.sin(t * 2) * 0.03,
          0,
          0.06 + (stunned ? 0.35 * stunK : 0),
        );
        R.upperArmR.rotation.set(
          sw * 1.0 + Math.sin(t * 2 + 1) * 0.03,
          0,
          -0.06 - (stunned ? 0.35 * stunK : 0),
        );
        // Elbows pump: bend harder as the arm swings back, ease forward.
        // A breath-rate flex keeps the hands alive even standing idle.
        const pumpL = Math.max(0, Math.sin(world.walkPhase)) * st;
        const pumpR = Math.max(0, -Math.sin(world.walkPhase)) * st;
        R.elbowL.rotation.set(
          -0.25 - runK * 0.6 - pumpL * 0.45 + (1 - st) * 0.06 * Math.sin(t * 2),
          0,
          0,
        );
        R.elbowR.rotation.set(
          -0.25 - runK * 0.6 - pumpR * 0.45 + (1 - st) * 0.06 * Math.sin(t * 2 + 1),
          0,
          0,
        );
        // Gentle torso yaw sway with stride; head nods when dazed.
        R.lean.rotation.y = world.playerMoving ? Math.sin(world.walkPhase) * 0.06 : 0;
        R.head.rotation.set(
          stunned ? 0.4 * stunK + Math.sin(t * 4.5) * 0.06 * stunK : 0,
          0,
          0,
        );
      }
      // Idle breathing + landing dip on the root height. The dip bends the
      // knees (below) instead of sinking the root, so feet stay planted.
      R.root.position.y =
        world.playerPos.y +
        (world.playerMoving ? 0 : Math.sin(t * 2) * 0.015) +
        lift -
        dip * 0.05;

      // Ease out of the seated pose right after dismount.
      if (s < 1) {
        const k = 1 - s;
        R.thighL.rotation.x = lerp(R.thighL.rotation.x, SIT.thighX, k);
        R.thighR.rotation.x = lerp(R.thighR.rotation.x, SIT.thighX, k);
        R.kneeL.rotation.x = lerp(R.kneeL.rotation.x, SIT.kneeX, k);
        R.kneeR.rotation.x = lerp(R.kneeR.rotation.x, SIT.kneeX, k);
        R.upperArmL.rotation.x = lerp(R.upperArmL.rotation.x, SIT.uaX, k);
        R.upperArmR.rotation.x = lerp(R.upperArmR.rotation.x, SIT.uaX, k);
        R.elbowL.rotation.x = lerp(R.elbowL.rotation.x, SIT.elX, k);
        R.elbowR.rotation.x = lerp(R.elbowR.rotation.x, SIT.elX, k);
      }
    } else {
      // Ride: ease standing→saddle on mount, then track the bike exactly.
      if (M.lastMode !== "ride") {
        M.lastMode = "ride";
        M.t = 0;
        M.fromPos.copy(R.root.position);
        M.fromYaw = R.root.rotation.y;
      }
      M.t = Math.min(1, M.t + dt / 0.35);
      const s = smooth(M.t);
      const fx = Math.sin(world.bikeYaw);
      const fz = Math.cos(world.bikeYaw);
      saddle.current.set(
        world.bikePos.x - fx * 0.3,
        world.bikePos.y + 0.1,
        world.bikePos.z - fz * 0.3,
      );
      R.root.position.lerpVectors(M.fromPos, saddle.current, s);
      R.root.rotation.set(0, lerpAngle(M.fromYaw, world.bikeYaw, s), 0);
      // Seated: thighs forward to the tank, shins down to the pegs, hands
      // to the grips (±0.36, 1.12). Idle-stand lerps in during the blend.
      R.thighL.rotation.set(lerp(0, SIT.thighX, s), 0, lerp(0, -0.05, s));
      R.thighR.rotation.set(lerp(0, SIT.thighX, s), 0, lerp(0, 0.05, s));
      R.kneeL.rotation.set(lerp(0.06, SIT.kneeX, s), 0, 0);
      R.kneeR.rotation.set(lerp(0.06, SIT.kneeX, s), 0, 0);
      R.upperArmL.rotation.set(lerp(0, SIT.uaX, s), 0, 0.06);
      R.upperArmR.rotation.set(lerp(0, SIT.uaX, s), 0, -0.06);
      R.elbowL.rotation.set(lerp(-0.25, SIT.elX, s), 0, 0);
      R.elbowR.rotation.set(lerp(-0.25, SIT.elX, s), 0, 0);
      R.head.rotation.set(0, 0, 0);
      R.lean.rotation.y = 0;
      stride.current = 0;
      tumble.current = 0;
      landDip.current = 0;
      wasAirborne.current = false;
    }
  });

  return <PlayerCharacter rigRef={rig} />;
}
