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
  const material = useRef<THREE.ShaderMaterial>(null!);
  const [size, setSize] = useState(() => qualityOceanSize());
  useEffect(() => subscribeQuality(() => setSize(qualityOceanSize())), []);

  useFrame(({ camera }, dt) => {
    const m = ref.current;
    if (!m) return;
    // Flat untextured plane: exact follow, no snap needed.
    m.position.set(camera.position.x, WATER_SURFACE_Y, camera.position.z);
    if (material.current) material.current.uniforms.uTime.value += Math.min(dt, 0.05);
  });

  return (
    <mesh
      key={size}
      ref={ref}
      rotation-x={-Math.PI / 2}
      position={[0, WATER_SURFACE_Y, 0]}
    >
      <planeGeometry args={[size, size, 96, 96]} />
      <shaderMaterial
        ref={material}
        uniforms={{ uTime: { value: 0 } }}
        vertexShader={`
          uniform float uTime;
          varying vec2 vUv;
          varying vec3 vWorld;
          void main() {
            vUv = uv;
            vec3 p = position;
            // Long diagonal ripples create a readable downstream flow.
            float wave = sin(p.x * 0.018 + p.y * 0.006 + uTime * 1.7) * 0.045
              + cos(p.x * 0.009 - p.y * 0.022 - uTime * 1.25) * 0.035
              + sin((p.x + p.y) * 0.009 + uTime * 0.8) * 0.025;
            p.z += wave;
            vWorld = p;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          varying vec2 vUv;
          varying vec3 vWorld;
          void main() {
            vec2 flowUv = vWorld.xy * vec2(0.026, 0.011);
            float streak = sin(flowUv.x - flowUv.y * 0.65 - uTime * 2.8);
            streak = smoothstep(0.68, 0.98, streak) * 0.18;
            float smallRipples = sin(vWorld.x * 0.11 + vWorld.y * 0.035 - uTime * 4.2) * 0.035;
            // Cheap drifting suspended silt: a few soft, moving cells rather
            // than a texture, so the water still works at any tile size.
            vec2 dustGrid = vWorld.xy * 0.09 + vec2(uTime * 0.32, -uTime * 0.18);
            vec2 dustCell = fract(dustGrid) - 0.5;
            float dust = smoothstep(0.16, 0.0, length(dustCell));
            dust *= 0.08 + 0.04 * sin(vWorld.x * 0.17 + uTime * 1.5);
            vec3 base = vec3(0.055, 0.34, 0.53);
            vec3 highlight = vec3(0.24, 0.68, 0.78);
            vec3 color = mix(base, highlight, max(0.0, streak + smallRipples));
            color = mix(color, vec3(0.68, 0.76, 0.67), dust);
            gl_FragColor = vec4(color, 0.84);
          }
        `}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
