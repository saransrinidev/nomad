// Ocean plane for the Tamil Nadu plain: flat sea surrounding the land
// plate. Terrain seabed sits at TN_SEA_H (-5m); this plane at
// WATER_SURFACE_Y reads as water against the 2 m land plate — and doubles
// as every river surface where channels are carved below it.
//
// Perf: a single tile follows the camera (sized past fog far so the edge
// never shows) and renders OPAQUE — no transparent pass, no blending,
// no sort against the skirt behind it.

"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WATER_SURFACE_Y } from "@/lib/game/map/terrain";
import { qualityOceanSize, subscribeQuality } from "@/lib/game/quality";

export default function Ocean() {
  const ref = useRef<THREE.Mesh>(null!);
  const [size, setSize] = useState(() => qualityOceanSize());
  useEffect(() => subscribeQuality(() => setSize(qualityOceanSize())), []);

  useFrame(({ camera }) => {
    const m = ref.current;
    if (!m) return;
    // Flat untextured plane: exact follow, no snap needed.
    m.position.set(camera.position.x, WATER_SURFACE_Y, camera.position.z);
  });

  return (
    <mesh
      key={size}
      ref={ref}
      rotation-x={-Math.PI / 2}
      position={[0, WATER_SURFACE_Y, 0]}
    >
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#3d9ad6" roughness={0.35} metalness={0} />
    </mesh>
  );
}
