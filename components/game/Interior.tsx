// Interior scene for an enterable building. Rendered in place of the outdoor
// world when world.interior is set. The room geometry matches the collision
// box in lib/game/map/interior.ts, and furniture is themed per building type.

"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { BuildingType } from "@/lib/game/map/village";
import {
  EXIT_HALF_W,
  INTERIOR_THEMES,
  ROOM_HALF_X,
  ROOM_HALF_Z,
  ROOM_HEIGHT,
  WALL_T,
} from "@/lib/game/map/interior";

function makeTitleTexture(title: string, accent: string): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#1d1d1d";
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 512, 16);
  ctx.fillRect(0, 112, 512, 16);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 56px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A simple colored box prop. */
function Box({
  p,
  s,
  color,
  emissive,
}: {
  p: [number, number, number];
  s: [number, number, number];
  color: string;
  emissive?: string;
}) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial
        color={color}
        emissive={emissive ?? "#000000"}
        emissiveIntensity={emissive ? 0.5 : 0}
        roughness={0.85}
      />
    </mesh>
  );
}

/** Per-type furniture. Kept lightweight (primitive boxes). */
function Furniture({ type, accent }: { type: BuildingType; accent: string }) {
  switch (type) {
    case "hospital":
      return (
        <group>
          {/* Reception desk */}
          <Box p={[-5, 0.5, -4]} s={[4, 1, 1.2]} color="#dfe8ea" />
          {/* Beds */}
          {[-2, 2].map((x) => (
            <group key={x} position={[x, 0, 2]}>
              <Box p={[0, 0.4, 0]} s={[1.6, 0.5, 3]} color="#ffffff" />
              <Box p={[0, 0.95, -1.2]} s={[1.6, 0.6, 0.3]} color="#cfe0e4" />
            </group>
          ))}
          {/* Red cross on back wall */}
          <Box p={[0, 2.4, -ROOM_HALF_Z + 0.5]} s={[1.6, 0.5, 0.1]} color={accent} />
          <Box p={[0, 2.4, -ROOM_HALF_Z + 0.5]} s={[0.5, 1.6, 0.1]} color={accent} />
        </group>
      );
    case "supermarket":
      return (
        <group>
          {/* Aisles of shelves */}
          {[-5, -1.5, 2, 5.5].map((x) => (
            <Box key={x} p={[x, 0.9, 0]} s={[1, 1.8, 8]} color="#c6c6c6" />
          ))}
          {/* Checkout counter */}
          <Box p={[0, 0.5, ROOM_HALF_Z - 3]} s={[6, 1, 1]} color={accent} />
        </group>
      );
    case "hotel":
      return (
        <group>
          {/* Reception + luggage + sofa */}
          <Box p={[-4, 0.6, -3]} s={[5, 1.2, 1.3]} color="#7a5a36" />
          <Box p={[4, 0.4, 2]} s={[3.5, 0.8, 1.6]} color="#8a3f27" />
          <Box p={[4, 0.9, 1.4]} s={[3.5, 0.6, 0.4]} color="#8a3f27" />
          <Box p={[0, 2.3, -ROOM_HALF_Z + 0.5]} s={[3, 0.8, 0.1]} color={accent} emissive={accent} />
        </group>
      );
    case "restaurant":
      return (
        <group>
          {/* Dining tables */}
          {[-5, 0, 5].map((x) =>
            [-2.5, 2.5].map((z) => (
              <group key={`${x}-${z}`} position={[x, 0, z]}>
                <Box p={[0, 0.5, 0]} s={[1.6, 0.15, 1.6]} color="#f0e2d0" />
                <Box p={[0, 0.25, 0]} s={[0.2, 0.5, 0.2]} color="#5a3b22" />
              </group>
            )),
          )}
          <Box p={[0, 0.6, -ROOM_HALF_Z + 1]} s={[6, 1.2, 1]} color={accent} />
        </group>
      );
    case "bank":
      return (
        <group>
          {/* Teller counter + vault */}
          <Box p={[0, 0.6, -2]} s={[10, 1.2, 1]} color="#cfd6df" />
          <Box p={[6, 1.2, 4]} s={[2.4, 2.4, 1]} color="#8d939c" emissive="#000000" />
          <Box p={[0, 2.4, -ROOM_HALF_Z + 0.5]} s={[2.5, 0.7, 0.1]} color={accent} emissive={accent} />
        </group>
      );
    case "pharmacy":
      return (
        <group>
          {[-5, -1.5, 2].map((x) => (
            <Box key={x} p={[x, 1, 0]} s={[1, 2, 6]} color="#eafaf6" />
          ))}
          <Box p={[5, 0.6, 2]} s={[4, 1.2, 1]} color={accent} />
          <Box p={[5, 2.3, -ROOM_HALF_Z + 0.5]} s={[0.8, 0.8, 0.1]} color={accent} emissive={accent} />
        </group>
      );
    case "school":
      return (
        <group>
          {/* Desks facing a board */}
          {[-4, 0, 4].map((x) =>
            [1, 4].map((z) => (
              <Box key={`${x}-${z}`} p={[x, 0.5, z]} s={[1.4, 0.6, 1]} color="#c9a46a" />
            )),
          )}
          <Box p={[0, 1.6, -ROOM_HALF_Z + 0.5]} s={[7, 2, 0.15]} color="#20392b" />
        </group>
      );
    default:
      // house / home — a cozy living room
      return (
        <group>
          <Box p={[-4, 0.5, 3]} s={[4, 0.8, 1.6]} color="#8a5a3a" />
          <Box p={[0, 0.3, -3]} s={[3, 0.5, 1.6]} color="#5a3b22" />
          <Box p={[5, 1, 0]} s={[1, 2, 3]} color="#efe6d6" />
        </group>
      );
  }
}

export default function Interior({ type }: { type: BuildingType }) {
  const theme = INTERIOR_THEMES[type];
  const sign = useMemo(() => makeTitleTexture(theme.title, theme.accent), [theme.title, theme.accent]);

  const w = ROOM_HALF_X * 2;
  const d = ROOM_HALF_Z * 2;
  // +Z wall is split around the exit gap.
  const sideW = ROOM_HALF_X - EXIT_HALF_W;

  return (
    <group>
      {/* Interior lighting (the outdoor sun is hidden behind the walls). */}
      <ambientLight intensity={0.75} />
      <pointLight position={[0, ROOM_HEIGHT - 0.5, 0]} intensity={1.3} distance={30} castShadow />
      <hemisphereLight args={["#ffffff", theme.floor, 0.4]} />

      {/* Floor */}
      <mesh position={[0, -0.01, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={theme.floor} roughness={0.95} />
      </mesh>
      {/* Ceiling */}
      <mesh position={[0, ROOM_HEIGHT, 0]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#f2f2f2" roughness={1} side={THREE.DoubleSide} />
      </mesh>

      {/* Back wall (-Z) */}
      <mesh position={[0, ROOM_HEIGHT / 2, -ROOM_HALF_Z]} receiveShadow>
        <boxGeometry args={[w, ROOM_HEIGHT, WALL_T]} />
        <meshStandardMaterial color={theme.wall} roughness={1} />
      </mesh>
      {/* Side walls (±X) */}
      <mesh position={[-ROOM_HALF_X, ROOM_HEIGHT / 2, 0]} receiveShadow>
        <boxGeometry args={[WALL_T, ROOM_HEIGHT, d]} />
        <meshStandardMaterial color={theme.wall} roughness={1} />
      </mesh>
      <mesh position={[ROOM_HALF_X, ROOM_HEIGHT / 2, 0]} receiveShadow>
        <boxGeometry args={[WALL_T, ROOM_HEIGHT, d]} />
        <meshStandardMaterial color={theme.wall} roughness={1} />
      </mesh>
      {/* Front wall (+Z) split around the exit doorway */}
      {[-1, 1].map((sgn) => (
        <mesh
          key={sgn}
          position={[sgn * (EXIT_HALF_W + sideW / 2), ROOM_HEIGHT / 2, ROOM_HALF_Z]}
          receiveShadow
        >
          <boxGeometry args={[sideW, ROOM_HEIGHT, WALL_T]} />
          <meshStandardMaterial color={theme.wall} roughness={1} />
        </mesh>
      ))}
      {/* Lintel over the exit */}
      <mesh position={[0, ROOM_HEIGHT - 0.4, ROOM_HALF_Z]}>
        <boxGeometry args={[EXIT_HALF_W * 2, 0.8, WALL_T]} />
        <meshStandardMaterial color={theme.accent} roughness={1} />
      </mesh>
      {/* EXIT marker above the door */}
      <mesh position={[0, ROOM_HEIGHT - 0.4, ROOM_HALF_Z - 0.26]}>
        <planeGeometry args={[1.6, 0.5]} />
        <meshStandardMaterial color="#111111" emissive={theme.accent} emissiveIntensity={0.7} />
      </mesh>

      {/* Title sign on the back wall */}
      {sign && (
        <mesh position={[0, ROOM_HEIGHT - 1, -ROOM_HALF_Z + 0.22]}>
          <planeGeometry args={[6, 1.5]} />
          <meshStandardMaterial map={sign} roughness={0.8} />
        </mesh>
      )}

      {/* Themed furniture */}
      <Furniture type={type} accent={theme.accent} />
    </group>
  );
}
