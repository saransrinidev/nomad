// Sky system: gradient dome, stars, sun + moon (sprites and lights),
// drifting low-poly clouds, and per-frame fog/background grading.
// Owns the clock: advances world.time unless paused.

"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  advanceTime,
  moonDirection,
  nightFactor,
  sampleSky,
  sunDirection,
} from "@/lib/game/map/time";
import { getFocusPoint, type GameWorld } from "@/lib/game/state";

const CLOUD_COUNT = 22;
const PUFFS_PER_CLOUD = 4;

function makeGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

interface CloudPuff {
  bx: number;
  by: number;
  bz: number;
  ox: number;
  oy: number;
  oz: number;
  sx: number;
  sy: number;
  sz: number;
}

export default function Sky({ worldRef }: { worldRef: RefObject<GameWorld> }) {
  const sunRef = useRef<THREE.DirectionalLight>(null!);
  const moonRef = useRef<THREE.DirectionalLight>(null!);
  const hemiRef = useRef<THREE.HemisphereLight>(null!);
  const domeRef = useRef<THREE.Mesh>(null!);
  const sunSprite = useRef<THREE.Sprite>(null!);
  const moonSprite = useRef<THREE.Sprite>(null!);
  const starsRef = useRef<THREE.Points>(null!);
  const cloudsRef = useRef<THREE.InstancedMesh>(null!);
  const elapsedRef = useRef(0);
  const scratchTarget = useMemo(() => new THREE.Object3D(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const skyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          topColor: { value: new THREE.Color("#3f8fd2") },
          horizonColor: { value: new THREE.Color("#bfe3f2") },
          sunDir: { value: new THREE.Vector3(0, 1, 0) },
          sunTint: { value: new THREE.Color("#fff2d9") },
          glowStrength: { value: 0.5 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 topColor;
          uniform vec3 horizonColor;
          uniform vec3 sunDir;
          uniform vec3 sunTint;
          uniform float glowStrength;
          varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y, -1.0, 1.0);
            vec3 col = h >= 0.0
              ? mix(horizonColor, topColor, pow(h, 0.55))
              : mix(horizonColor, horizonColor * 0.3, clamp(-h * 3.0, 0.0, 1.0));
            // Warm glow + halo around the sun disc (golden-hour bloom feel).
            float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
            col += sunTint * (pow(d, 6.0) * 0.35 + pow(d, 64.0) * 0.9) * glowStrength;
            // Horizon haze band for atmospheric perspective.
            float haze = (1.0 - abs(h)) * (1.0 - abs(h));
            col = mix(col, horizonColor * 1.04, haze * 0.35);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    [],
  );

  const domeGeo = useMemo(() => new THREE.SphereGeometry(1500, 24, 16), []);
  const glowTex = useMemo(
    () => (typeof document === "undefined" ? null : makeGlowTexture()),
    [],
  );

  const starGeo = useMemo(() => {
    let s = 777;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    const pos = new Float32Array(400 * 3);
    for (let i = 0; i < 400; i++) {
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(rand() * 0.95); // upper sky
      const r = 1400;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) + 40;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  const cloudGeo = useMemo(() => new THREE.SphereGeometry(1, 7, 6), []);
  const cloudMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 1,
        flatShading: true,
      }),
    [],
  );

  const puffs = useMemo<CloudPuff[]>(() => {
    let s = 4242;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    const list: CloudPuff[] = [];
    for (let c = 0; c < CLOUD_COUNT; c++) {
      const bx = (rand() - 0.5) * 560;
      const by = 62 + rand() * 48;
      const bz = (rand() - 0.5) * 560;
      for (let p = 0; p < PUFFS_PER_CLOUD; p++) {
        const sc = 6 + rand() * 7;
        list.push({
          bx,
          by,
          bz,
          ox: (rand() - 0.5) * 16,
          oy: (rand() - 0.5) * 3,
          oz: (rand() - 0.5) * 8,
          sx: sc,
          sy: sc * 0.55,
          sz: sc * 0.8,
        });
      }
    }
    return list;
  }, []);

  useFrame(({ scene, gl }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const world = worldRef.current;
    if (!world.paused) world.time = advanceTime(world.time, dt);

    // Cinematic tone mapping (ACES Filmic) with clock-driven exposure.
    if (gl.toneMapping !== THREE.ACESFilmicToneMapping) {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
    }

    const focus = getFocusPoint(world);
    const sample = sampleSky(world.time);
    const night = nightFactor(world.time);
    const sunDir = sunDirection(world.time);
    const moonDir = moonDirection(world.time);

    // Sky dome + fog + background follow the player and the palette.
    domeRef.current.position.set(focus.x, 0, focus.z);
    (skyMat.uniforms.topColor.value as THREE.Color).set(sample.top);
    (skyMat.uniforms.horizonColor.value as THREE.Color).set(sample.horizon);
    (skyMat.uniforms.sunDir.value as THREE.Vector3).set(sunDir[0], sunDir[1], sunDir[2]);
    (skyMat.uniforms.sunTint.value as THREE.Color).set(sample.light);
    // Glow peaks at golden hour, rests at a soft halo by day, off at night.
    const glow = Math.min(1, sample.sunI / 1.7);
    (skyMat.uniforms.glowStrength.value as number) = 0.15 + glow * 0.65;
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(sample.fog);
      scene.fog.near = 250;
      scene.fog.far = sample.fogFar;
    }
    if (scene.background instanceof THREE.Color) scene.background.set(sample.fog);
    // Damped exposure so brightness breathes instead of popping.
    gl.toneMappingExposure += (sample.exposure - gl.toneMappingExposure) * Math.min(1, dt * 2);

    // Sun light (shadow caster) + moon light (no shadows).
    sunRef.current.position.set(
      focus.x + sunDir[0] * 120,
      Math.max(sunDir[1], 0.04) * 120,
      focus.z + sunDir[2] * 120,
    );
    sunRef.current.color.set(sample.light);
    sunRef.current.intensity = sample.sunI;
    scratchTarget.position.set(focus.x, 0, focus.z);
    scratchTarget.updateMatrixWorld();
    moonRef.current.position.set(
      focus.x + moonDir[0] * 120,
      Math.max(moonDir[1], 0.08) * 120,
      focus.z + moonDir[2] * 120,
    );
    moonRef.current.color.set("#a8c0ff");
    moonRef.current.intensity = sample.moonI;
    hemiRef.current.color.set(sample.top);
    hemiRef.current.groundColor.set("#5a6f52");
    hemiRef.current.intensity = sample.hemiI;

    // Sun / moon sprites.
    const day = 1 - night;
    sunSprite.current.position.set(
      focus.x + sunDir[0] * 1300,
      sunDir[1] * 1300,
      focus.z + sunDir[2] * 1300,
    );
    (sunSprite.current.material as THREE.SpriteMaterial).opacity =
      THREE.MathUtils.clamp(sunDir[1] * 4 + 0.3, 0, 1) * day;
    (sunSprite.current.material as THREE.SpriteMaterial).color.set(sample.light);
    moonSprite.current.position.set(
      focus.x + moonDir[0] * 1300,
      moonDir[1] * 1300,
      focus.z + moonDir[2] * 1300,
    );
    (moonSprite.current.material as THREE.SpriteMaterial).opacity =
      THREE.MathUtils.clamp(moonDir[1] * 4 + 0.3, 0, 1) * Math.max(night, 0.15);

    // Stars fade in at night.
    (starsRef.current.material as THREE.PointsMaterial).opacity = night;
    starsRef.current.position.set(focus.x, 0, focus.z);

    // Clouds drift with the wind (+X) and wrap around the player.
    cloudMat.color.set(sample.top).lerp(new THREE.Color("#ffffff"), 1 - night * 0.75);
    if (!world.paused) elapsedRef.current += dt;
    const driftX = (elapsedRef.current * 2) % 560;
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i];
      let dx = (p.bx + p.ox + driftX - focus.x) % 560;
      if (dx > 280) dx -= 560;
      if (dx < -280) dx += 560;
      let dz = (p.bz + p.oz - focus.z) % 560;
      if (dz > 280) dz -= 560;
      if (dz < -280) dz += 560;
      dummy.position.set(focus.x + dx, p.by + p.oy, focus.z + dz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(p.sx, p.sy, p.sz);
      dummy.updateMatrix();
      cloudsRef.current.setMatrixAt(i, dummy.matrix);
    }
    cloudsRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <mesh ref={domeRef} geometry={domeGeo} material={skyMat} renderOrder={-1} frustumCulled={false} />
      <points ref={starsRef} geometry={starGeo} frustumCulled={false}>
        <pointsMaterial color="#ffffff" size={1.8} sizeAttenuation={false} transparent opacity={0} depthWrite={false} fog={false} />
      </points>
      {glowTex && (
        <>
          <sprite ref={sunSprite} scale={[220, 220, 1]}>
            <spriteMaterial map={glowTex} color="#ffdf9e" transparent opacity={1} depthWrite={false} fog={false} />
          </sprite>
          <sprite ref={moonSprite} scale={[130, 130, 1]}>
            <spriteMaterial map={glowTex} color="#e8ecf5" transparent opacity={0} depthWrite={false} fog={false} />
          </sprite>
        </>
      )}
      <hemisphereLight ref={hemiRef} args={["#cfeaff", "#6a8f5a", 0.7]} />
      <directionalLight
        ref={sunRef}
        castShadow
        intensity={1.6}
        color="#fff4e0"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={1}
        shadow-camera-far={400}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
        target={scratchTarget}
      />
      <directionalLight ref={moonRef} intensity={0} color="#a8c0ff" target={scratchTarget} />
      <primitive object={scratchTarget} />
      <instancedMesh
        ref={cloudsRef}
        args={[cloudGeo, cloudMat, puffs.length]}
        frustumCulled={false}
      />
    </group>
  );
}
