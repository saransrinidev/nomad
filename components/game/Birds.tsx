// Bird flock: swallows soar in circles around the player, periodically peel
// off to a nearby water edge, fold wings to drink, then climb back. Bodies
// built imperatively once (shared geometries/materials); all motion is
// per-frame matrix/rotation writes — zero React re-renders.

"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { DRINK_SPOTS, nearestDrinkSpots } from "@/lib/game/map/water";
import { getFocusPoint, type GameWorld } from "@/lib/game/state";

const BIRD_COUNT = 7;

type BirdMode = "soar" | "toWater" | "drink" | "return";

interface BirdSim {
  root: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  mode: BirdMode;
  radius: number;
  height: number;
  phase: number;
  speed: number;
  dir: 1 | -1;
  t: number;
  dur: number;
  cooldown: number;
  flapT: number;
  flapSlow: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  dirV: THREE.Vector3;
}

function buildBird(
  bodyGeo: THREE.BoxGeometry,
  headGeo: THREE.BoxGeometry,
  beakGeo: THREE.ConeGeometry,
  wingGeo: THREE.BoxGeometry,
  bodyMat: THREE.MeshStandardMaterial,
  wingMat: THREE.MeshStandardMaterial,
  beakMat: THREE.MeshStandardMaterial,
  i: number,
): BirdSim {
  const root = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  root.add(body);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(0, 0.1, 0.3);
  root.add(head);
  const beak = new THREE.Mesh(beakGeo, beakMat);
  beak.position.set(0, 0.08, 0.45);
  beak.rotation.x = Math.PI / 2;
  root.add(beak);
  const wingL = new THREE.Group();
  wingL.position.set(0.1, 0.05, 0);
  const wl = new THREE.Mesh(wingGeo, wingMat);
  wl.position.x = 0.32;
  wingL.add(wl);
  root.add(wingL);
  const wingR = new THREE.Group();
  wingR.position.set(-0.1, 0.05, 0);
  const wr = new THREE.Mesh(wingGeo, wingMat);
  wr.position.x = -0.32;
  wingR.add(wr);
  root.add(wingR);
  return {
    root,
    wingL,
    wingR,
    mode: "soar",
    radius: 26 + i * 7,
    height: 30 + i * 3,
    phase: (i / BIRD_COUNT) * Math.PI * 2,
    speed: 9 + (i % 3) * 1.5,
    dir: i % 2 === 0 ? 1 : -1,
    t: 0,
    dur: 0,
    cooldown: 10 + i * 6,
    flapT: i * 1.7,
    flapSlow: i * 2.3,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    dirV: new THREE.Vector3(0, 0, 1),
  };
}

const _ahead = new THREE.Vector3();

export default function Birds({ worldRef }: { worldRef: React.RefObject<GameWorld> }) {
  const centerRef = useRef<THREE.Vector3 | null>(null);
  if (centerRef.current === null) centerRef.current = new THREE.Vector3(0, 0, 0);
  const center = centerRef.current;

  const assets = useMemo(() => {
    const bodyGeo = new THREE.BoxGeometry(0.18, 0.16, 0.5);
    const headGeo = new THREE.BoxGeometry(0.16, 0.16, 0.18);
    const beakGeo = new THREE.ConeGeometry(0.05, 0.14, 6);
    const wingGeo = new THREE.BoxGeometry(0.55, 0.04, 0.3);
    const bodyMat = new THREE.MeshStandardMaterial({ color: "#23272e", roughness: 0.9 });
    const wingMat = new THREE.MeshStandardMaterial({ color: "#39404b", roughness: 0.9 });
    const beakMat = new THREE.MeshStandardMaterial({ color: "#e0913d", roughness: 0.8 });
    const birds: BirdSim[] = [];
    for (let i = 0; i < BIRD_COUNT; i++) {
      birds.push(buildBird(bodyGeo, headGeo, beakGeo, wingGeo, bodyMat, wingMat, beakMat, i));
    }
    return { birds };
  }, []);

  // Mutable sim state behind a ref: the frame loop owns these writes.
  const simRef = useRef(assets.birds);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const world = worldRef.current;
    if (world.paused) return;
    const focus = getFocusPoint(world);

    // Flock home trails the player so birds are always around.
    const k = Math.min(1, dt * 0.8);
    center.x += (focus.x - center.x) * k;
    center.z += (focus.z - center.z) * k;

    const elapsed = performance.now() / 1000;
    for (const b of simRef.current) {
      const gliding = 0.25 + 0.75 * Math.max(0, Math.sin(elapsed * 0.5 + b.flapSlow));

      if (b.mode === "soar") {
        b.phase += ((b.dir * b.speed) / b.radius) * dt;
        b.root.position.set(
          center.x + Math.cos(b.phase) * b.radius,
          b.height + Math.sin(elapsed * 0.7 + b.phase) * 3,
          center.z + Math.sin(b.phase) * b.radius,
        );
        _ahead.set(-Math.sin(b.phase) * b.dir, 0, Math.cos(b.phase) * b.dir);
        b.root.lookAt(
          b.root.position.x + _ahead.x,
          b.root.position.y,
          b.root.position.z + _ahead.z,
        );
        b.root.rotateZ(-b.dir * 0.28); // bank into the turn
        b.cooldown -= dt;
        if (b.cooldown <= 0) {
          const [sx, sz] = DRINK_SPOTS[nearestDrinkSpots(b.root.position.x, b.root.position.z, 1)[0]];
          b.from.copy(b.root.position);
          b.to.set(sx, 0.35, sz);
          b.dirV.copy(b.to).sub(b.from);
          const dist = b.dirV.length();
          b.dirV.normalize();
          b.dur = Math.max(2, dist / 14);
          b.t = 0;
          b.mode = "toWater";
        }
      } else if (b.mode === "toWater" || b.mode === "return") {
        b.t += dt;
        const kk = Math.min(1, b.t / b.dur);
        const e = kk * kk * (3 - 2 * kk);
        b.root.position.lerpVectors(b.from, b.to, e);
        b.root.position.y += Math.sin(e * Math.PI) * (b.mode === "toWater" ? 6 : 3);
        b.root.lookAt(
          b.root.position.x + b.dirV.x,
          b.root.position.y + b.dirV.y * 0.5,
          b.root.position.z + b.dirV.z,
        );
        if (kk >= 1) {
          if (b.mode === "toWater") {
            b.mode = "drink";
            b.t = 0;
            b.dur = 3.5;
          } else {
            const dx = b.root.position.x - center.x;
            const dz = b.root.position.z - center.z;
            b.phase = Math.atan2(dz, dx);
            b.cooldown = 25;
            b.mode = "soar";
          }
        }
      } else {
        // drink: folded wings, dipping head.
        b.t += dt;
        b.root.position.y = 0.32 + Math.abs(Math.sin(b.t * 2.2)) * 0.02;
        b.root.rotation.x = 0.25 + Math.sin(b.t * 3.1) * 0.15;
        if (b.t >= b.dur) {
          b.from.copy(b.root.position);
          const dx = b.root.position.x - center.x;
          const dz = b.root.position.z - center.z;
          const r = Math.max(20, Math.hypot(dx, dz));
          const nx = dx / (r || 1);
          const nz = dz / (r || 1);
          b.to.set(center.x + nx * b.radius, b.height, center.z + nz * b.radius);
          b.dirV.copy(b.to).sub(b.from);
          const dist = b.dirV.length();
          b.dirV.normalize();
          b.dur = Math.max(2, dist / 14);
          b.t = 0;
          b.mode = "return";
        }
      }

      // Wings: flapping in flight, folded while drinking.
      b.flapT += dt * (b.mode === "drink" ? 2 : 9);
      const fold = b.mode === "drink" ? 1.25 : 0.12;
      const amp = b.mode === "drink" ? 0.03 : 0.65 * gliding + 0.08;
      const flap = fold + Math.sin(b.flapT) * amp;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
    }
  });

  return (
    <group>
      {assets.birds.map((b, i) => (
        <primitive key={i} object={b.root} />
      ))}
    </group>
  );
}
