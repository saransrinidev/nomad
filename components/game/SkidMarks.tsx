// Tire skid marks: fading ribbon strips laid by both wheels while braking
// hard at speed (or while drifting). One preallocated indexed BufferGeometry
// (two strips share it), per-vertex alpha aged on the CPU — a single draw
// call, zero per-frame allocation.

"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GameWorld } from "@/lib/game/state";

const SEGMENTS = 256; // per wheel
const LIFE = 9; // seconds a mark stays visible
const GROUND_Y = 0.03;
const TIRE_WIDTH = 0.16;
const STEP_DIST = 0.35; // min travel between segments
const REAR_Z = -0.95;
const FRONT_Z = 1.0;

/** One wheel's ribbon strip inside the shared arrays. */
class Strip {
  head = 0;
  count = 0;
  tailLX = 0;
  tailLZ = 0;
  tailRX = 0;
  tailRZ = 0;
  hasTail = false;

  constructor(
    private cap: number,
    private base: number, // vertex offset in shared arrays
    private pos: Float32Array,
    private alpha: Float32Array,
    private birth: Float64Array,
  ) {}

  private slotVertex(slot: number, v: number) {
    return (this.base + slot * 4 + v) * 3;
  }

  push(lx: number, lz: number, rx: number, rz: number, now: number) {
    if (!this.hasTail) {
      this.tailLX = lx;
      this.tailLZ = lz;
      this.tailRX = rx;
      this.tailRZ = rz;
      this.hasTail = true;
      return;
    }
    const mcx = (this.tailLX + this.tailRX) / 2;
    const mcz = (this.tailLZ + this.tailRZ) / 2;
    const ncx = (lx + rx) / 2;
    const ncz = (lz + rz) / 2;
    if (Math.hypot(ncx - mcx, ncz - mcz) < STEP_DIST) return;

    const slot = this.head % this.cap;
    this.head++;
    if (this.count < this.cap) this.count++;
    let o = this.slotVertex(slot, 0);
    this.pos[o] = this.tailLX;
    this.pos[o + 1] = GROUND_Y;
    this.pos[o + 2] = this.tailLZ;
    o = this.slotVertex(slot, 1);
    this.pos[o] = this.tailRX;
    this.pos[o + 1] = GROUND_Y;
    this.pos[o + 2] = this.tailRZ;
    o = this.slotVertex(slot, 2);
    this.pos[o] = lx;
    this.pos[o + 1] = GROUND_Y;
    this.pos[o + 2] = lz;
    o = this.slotVertex(slot, 3);
    this.pos[o] = rx;
    this.pos[o + 1] = GROUND_Y;
    this.pos[o + 2] = rz;
    this.birth[this.base / 4 + slot] = now;

    this.tailLX = lx;
    this.tailLZ = lz;
    this.tailRX = rx;
    this.tailRZ = rz;
  }

  break() {
    this.hasTail = false;
  }

  age(now: number) {
    if (this.count === 0) return false;
    let alive = false;
    for (let s = 0; s < this.count; s++) {
      // Oldest segment lives at (head - count + s) in ring order.
      const slot = (((this.head - this.count + s) % this.cap) + this.cap) % this.cap;
      const b = this.birth[this.base / 4 + slot];
      if (b <= 0) continue;
      const k = 1 - (now - b) / LIFE;
      const a = k <= 0 ? 0 : k;
      if (a > 0) alive = true;
      else this.birth[this.base / 4 + slot] = 0;
      const vo = this.base + slot * 4;
      this.alpha[vo] = a;
      this.alpha[vo + 1] = a;
      this.alpha[vo + 2] = a;
      this.alpha[vo + 3] = a;
    }
    return alive;
  }
}

export default function SkidMarks({ worldRef }: { worldRef: React.RefObject<GameWorld> }) {
  // Immutable handles (JSX + disposal) come from the memo; everything the
  // frame loop mutates goes through the ref (React Compiler friendly).
  const bundle = useMemo(() => {
    const vertsPerStrip = SEGMENTS * 4;
    const totalVerts = vertsPerStrip * 2;
    const pos = new Float32Array(totalVerts * 3);
    const alpha = new Float32Array(totalVerts);
    const birth = new Float64Array(SEGMENTS * 2);
    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pos, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const alphaAttr = new THREE.BufferAttribute(alpha, 1);
    alphaAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", posAttr);
    geo.setAttribute("aAlpha", alphaAttr);
    const index: number[] = [];
    for (let strip = 0; strip < 2; strip++) {
      const base = strip * vertsPerStrip;
      for (let s = 0; s < SEGMENTS; s++) {
        const v = base + s * 4;
        index.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
      }
    }
    geo.setIndex(index);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(0.03, 0.03, 0.035, vAlpha * 0.6);
        }
      `,
    });
    const strips = [
      new Strip(SEGMENTS, 0, pos, alpha, birth),
      new Strip(SEGMENTS, vertsPerStrip, pos, alpha, birth),
    ];
    return { geo, strips, posAttr, alphaAttr, mat };
  }, []);

  const mutableRef = useRef(bundle);

  useEffect(() => {
    return () => {
      bundle.geo.dispose();
      bundle.mat.dispose();
    };
  }, [bundle]);

  useFrame(() => {
    const world = worldRef.current;
    if (world.paused) return;
    const now = performance.now() / 1000;
    const store = mutableRef.current;

    const riding = world.mode === "ride";
    const braking =
      world.keys.brake || (world.keys.back && world.bikeSpeed > 0.5);
    const laying = riding && Math.abs(world.bikeSpeed) > 6 && braking;

    if (laying) {
      const yaw = world.bikeYaw;
      const sy = Math.sin(yaw);
      const cy = Math.cos(yaw);
      // Right vector for tire width (matches movement basis).
      const rx = -cy;
      const rz = sy;
      const hw = TIRE_WIDTH / 2;
      const wheels: [Strip, number][] = [
        [store.strips[0], REAR_Z],
        [store.strips[1], FRONT_Z],
      ];
      for (const [strip, lz] of wheels) {
        const cx = world.bikePos.x + lz * sy;
        const cz = world.bikePos.z + lz * cy;
        strip.push(cx - rx * hw, cz - rz * hw, cx + rx * hw, cz + rz * hw, now);
      }
    } else {
      store.strips[0].break();
      store.strips[1].break();
    }

    if (laying) mutableRef.current.posAttr.needsUpdate = true;
    let anyAlive = false;
    for (const strip of store.strips) {
      if (strip.age(now)) anyAlive = true;
    }
    if (anyAlive || laying) mutableRef.current.alphaAttr.needsUpdate = true;
  });

  return <mesh geometry={bundle.geo} material={bundle.mat} frustumCulled={false} renderOrder={1} />;
}
