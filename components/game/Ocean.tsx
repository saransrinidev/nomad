// Ocean plane for the Tamil Nadu plain: flat sea surrounding the land
// plate. Terrain seabed sits at TN_SEA_H (-5m); this translucent plane at
// y=0.3 reads as water against the 2m land plate.

"use client";

export default function Ocean() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.3, 0]}>
      <planeGeometry args={[48000, 48000]} />
      <meshStandardMaterial
        color="#3d9ad6"
        transparent
        opacity={0.9}
        roughness={0.35}
        metalness={0}
      />
    </mesh>
  );
}
