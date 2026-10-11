// Basic rail bridges: one instanced deck slab + side beams + railing
// posts per over-water run. Placement comes straight from bridgeRuns()
// (exact center/yaw/length/deck-top per detection), so visuals and the
// walkable collision can never drift apart — restyle freely, the data
// contract is { line, x, z, yaw, len, top, pts }.
//
// Deck top sits exactly on the track datum (feet level, same as walking
// ballast on land); the ballast bed renders just above like everywhere
// else. Piers come from Railway's trestle instancing.

"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { bridgeWalks } from "@/lib/game/map/railway";
import { useFillInstances } from "./Railway";

const DECK_W = 5;
const DECK_T = 0.3;
const RAIL_X = 2.35;
const RAIL_TOP = 1.0;
const POST_H = 1.0;

interface Placed {
  x: number;
  y: number;
  z: number;
  yaw: number;
  len: number;
}

export function BridgeDeck({
  x,
  z,
  yaw,
  len,
  top,
}: {
  x: number;
  z: number;
  yaw: number;
  len: number;
  top: number;
}) {
  return (
    <group position={[x, top, z]} rotation-y={yaw}>
      {/* Deck slab (top flush with the track datum = feet level). */}
      <mesh position={[0, -DECK_T / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[DECK_W, DECK_T, len]} />
        <meshStandardMaterial color="#8a8f98" roughness={0.9} />
      </mesh>
      {/* Side beams double as curbs/railing base. */}
      {[-RAIL_X, RAIL_X].map((sx) => (
        <mesh key={sx} position={[sx, RAIL_TOP - 0.25, 0]} castShadow>
          <boxGeometry args={[0.15, 0.5, len]} />
          <meshStandardMaterial color="#6b6259" roughness={1} />
        </mesh>
      ))}
      {/* Railing posts every ~4 m both edges. */}
      {Array.from({ length: Math.max(2, Math.round(len / 4) + 1) }).map((_, i, arr) => {
        const z = -len / 2 + (len * i) / (arr.length - 1);
        return [-RAIL_X, RAIL_X].map((sx) => (
          <mesh key={`${i}:${sx}`} position={[sx, 0.5, z]}>
            <boxGeometry args={[0.12, POST_H, 0.12]} />
            <meshStandardMaterial color="#3a3f45" roughness={0.8} />
          </mesh>
        ));
      })}
    </group>
  );
}

export default function Bridges() {
  const deckRef = useRef<THREE.InstancedMesh>(null!);
  const beamRef = useRef<THREE.InstancedMesh>(null!);
  const postRef = useRef<THREE.InstancedMesh>(null!);

  // Decks render for every walk segment; beams/posts only where the
  // segment is railed (no handrails in multi-line overlap zones — same
  // flag the collision uses, so visuals and rails match exactly).
  const { decks, beams, posts } = useMemo(() => {
    const decks: Placed[] = [];
    const beams: Placed[] = [];
    const posts: { x: number; y: number; z: number; yaw: number }[] = [];
    for (const w of bridgeWalks()) {
      const dx = w.bx - w.ax;
      const dz = w.bz - w.az;
      const segLen = Math.hypot(dx, dz);
      if (segLen < 0.01) continue;
      const yaw = Math.atan2(dx, dz);
      const mx = (w.ax + w.bx) / 2;
      const mz = (w.az + w.bz) / 2;
      const top = (w.ta + w.tb) / 2;
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      decks.push({ x: mx, y: top - DECK_T / 2, z: mz, yaw, len: segLen + 0.4 });
      if (!w.railed) continue;
      for (const sx of [-RAIL_X, RAIL_X]) {
        beams.push({
          x: mx + rx * sx,
          y: top + RAIL_TOP - 0.25,
          z: mz + rz * sx,
          yaw,
          len: segLen + 0.4,
        });
        posts.push({
          x: w.ax + rx * sx,
          y: top + 0.5,
          z: w.az + rz * sx,
          yaw: 0,
        });
      }
    }
    return { decks, beams, posts };
  }, []);

  useFillInstances(deckRef, decks, 1);
  useFillInstances(beamRef, beams, 1);
  useFillInstances(postRef, posts, 1);

  return (
    <group>
      <instancedMesh ref={deckRef} args={[undefined, undefined, decks.length]} frustumCulled={false}>
        <boxGeometry args={[DECK_W, DECK_T, 1]} />
        <meshStandardMaterial color="#8a8f98" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={beamRef} args={[undefined, undefined, beams.length]} frustumCulled={false}>
        <boxGeometry args={[0.15, 0.5, 1]} />
        <meshStandardMaterial color="#6b6259" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={postRef} args={[undefined, undefined, posts.length]} frustumCulled={false}>
        <boxGeometry args={[0.12, POST_H, 0.12]} />
        <meshStandardMaterial color="#3a3f45" roughness={0.8} />
      </instancedMesh>
    </group>
  );
}
