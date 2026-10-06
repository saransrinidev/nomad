// Small recognizable library: brick body, pyramid roof, glowing windows,
// entrance steps, columns, and a canvas-texture "LIBRARY" sign
// (no font loading required). Static — no per-frame work.

"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { LIBRARY_POSITION } from "@/lib/game/gameConstants";

const WALL = "#c9a876";
const TRIM = "#f3ede0";
const ROOF = "#7a4a3a";
const GLASS = "#bfe6f5";
const DOOR = "#4a3226";

function makeSignTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2b3a4a";
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = "#e8d9a0";
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = "#f5ecd0";
  ctx.font = "bold 72px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("LIBRARY", 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export default function Library() {
  const sign = useMemo(() => makeSignTexture(), []);
  const [lx, , lz] = LIBRARY_POSITION;

  // Front of the building faces +Z toward the spawn area.
  return (
    <group position={[lx, 0, lz]} rotation-y={Math.PI}>
      {/* Main hall */}
      <mesh position={[0, 3, 0]} castShadow receiveShadow>
        <boxGeometry args={[15, 6, 11]} />
        <meshStandardMaterial color={WALL} roughness={0.95} />
      </mesh>
      {/* Base trim */}
      <mesh position={[0, 0.35, 0]} receiveShadow>
        <boxGeometry args={[15.5, 0.7, 11.5]} />
        <meshStandardMaterial color={TRIM} roughness={0.95} />
      </mesh>
      {/* Cornice under roof */}
      <mesh position={[0, 6.15, 0]} castShadow>
        <boxGeometry args={[15.6, 0.35, 11.6]} />
        <meshStandardMaterial color={TRIM} roughness={0.95} />
      </mesh>
      {/* Pyramid roof */}
      <mesh position={[0, 7.9, 0]} rotation-y={Math.PI / 4} castShadow>
        <coneGeometry args={[11.4, 3.4, 4]} />
        <meshStandardMaterial color={ROOF} roughness={0.9} flatShading />
      </mesh>

      {/* Entrance portico (front, -Z side) */}
      <mesh position={[0, 2.2, -6.6]} castShadow receiveShadow>
        <boxGeometry args={[6, 4.4, 2.4]} />
        <meshStandardMaterial color={TRIM} roughness={0.95} />
      </mesh>
      <mesh position={[0, 4.65, -6.6]} castShadow>
        <boxGeometry args={[6.6, 0.4, 3]} />
        <meshStandardMaterial color={ROOF} roughness={0.9} />
      </mesh>
      {/* Columns */}
      {[-2.4, 2.4].map((x) => (
        <mesh key={x} position={[x, 2.2, -7.5]} castShadow>
          <cylinderGeometry args={[0.32, 0.36, 4.4, 10]} />
          <meshStandardMaterial color={TRIM} roughness={0.9} />
        </mesh>
      ))}
      {/* Door */}
      <mesh position={[0, 1.5, -7.82]}>
        <boxGeometry args={[2.2, 3, 0.15]} />
        <meshStandardMaterial color={DOOR} roughness={0.85} />
      </mesh>
      {/* Steps */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.15 + i * 0.18, -9.05 + i * 0.45]} receiveShadow>
          <boxGeometry args={[5 - i * 0.4, 0.18, 0.9]} />
          <meshStandardMaterial color="#9a9aa0" roughness={1} />
        </mesh>
      ))}

      {/* Front windows (emissive for a warm interior glow) */}
      {[-5.2, -3.1, 3.1, 5.2].map((x) => (
        <group key={x} position={[x, 3.2, -5.53]}>
          <mesh>
            <boxGeometry args={[1.7, 2.2, 0.1]} />
            <meshStandardMaterial
              color={GLASS}
              emissive="#ffe9b8"
              emissiveIntensity={0.55}
              roughness={0.2}
            />
          </mesh>
          <mesh position={[0, 0, -0.02]}>
            <boxGeometry args={[0.12, 2.2, 0.12]} />
            <meshStandardMaterial color={TRIM} roughness={0.9} />
          </mesh>
        </group>
      ))}
      {/* Side windows */}
      {[-3, 0, 3].map((z) => (
        <mesh key={z} position={[7.53, 3.2, z]} rotation-y={Math.PI / 2}>
          <boxGeometry args={[1.7, 2.2, 0.1]} />
          <meshStandardMaterial
            color={GLASS}
            emissive="#ffe9b8"
            emissiveIntensity={0.45}
            roughness={0.2}
          />
        </mesh>
      ))}

      {/* LIBRARY sign above the entrance */}
      {sign && (
        <mesh position={[0, 5.35, -7.0]}>
          <planeGeometry args={[5.4, 1.35]} />
          <meshStandardMaterial map={sign} roughness={0.8} />
        </mesh>
      )}

      {/* Walkway from the front steps toward spawn */}
      <mesh position={[0, 0.02, -13]} receiveShadow>
        <boxGeometry args={[3.2, 0.06, 12]} />
        <meshStandardMaterial color="#a8a8ae" roughness={1} />
      </mesh>

      {/* Two lamp posts flanking the walkway */}
      {[-2.6, 2.6].map((x) => (
        <group key={x} position={[x, 0, -11]}>
          <mesh position={[0, 1.6, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.12, 3.2, 8]} />
            <meshStandardMaterial color="#2f3540" roughness={0.8} />
          </mesh>
          <mesh position={[0, 3.35, 0]}>
            <sphereGeometry args={[0.28, 12, 12]} />
            <meshStandardMaterial
              color="#fff3c4"
              emissive="#ffedb0"
              emissiveIntensity={1.6}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
