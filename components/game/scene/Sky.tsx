// Sky system: gradient dome, stars, sun + moon (sprites and lights),
// drifting fluffy billboard clouds, and per-frame fog/background grading.
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

const CLOUD_COUNT = 24;
const CLOUD_VARIANTS = 4;

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
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Bakes one fluffy cumulus puff-sheet: many overlapping soft radial blobs
 * composited on a 256x128 canvas, then masked with a soft elliptical falloff
 * so the sprite silhouette is blurry all around — same soft-body language as
 * the sun glow sprite (no hard polygonal edges, no flat shading).
 */
function makeFluffyCloudTexture(seed: number): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  ctx.clearRect(0, 0, W, H);

  // --- Body: large soft blobs clustered around the middle (denser below). ---
  const blobs = 20 + Math.floor(rand() * 6);
  for (let i = 0; i < blobs; i++) {
    const t = rand(); // 0..1 horizontal spread
    const cx = W * 0.5 + (t - 0.5) * W * 0.62;
    // Bias puffs toward the vertical centre, with a fuller belly.
    const belly = Math.cos((t - 0.5) * Math.PI) * H * 0.08;
    const cy = H * 0.58 - belly * 0.5 + (rand() - 0.5) * H * 0.38;
    const r = 20 + rand() * 34;
    const a = 0.42 + rand() * 0.38; // per-puff peak alpha
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
    g.addColorStop(0.45, `rgba(255,255,255,${(a * 0.55).toFixed(3)})`);
    g.addColorStop(0.75, `rgba(255,255,255,${(a * 0.18).toFixed(3)})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Crown: smaller brighter highlights along the top for a lit fluffy top. ---
  const caps = 7 + Math.floor(rand() * 4);
  for (let i = 0; i < caps; i++) {
    const cx = W * 0.5 + (rand() - 0.5) * W * 0.48;
    const cy = H * 0.38 + (rand() - 0.5) * H * 0.22;
    const r = 12 + rand() * 18;
    const a = 0.5 + rand() * 0.3;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
    g.addColorStop(0.6, `rgba(255,255,255,${(a * 0.35).toFixed(3)})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Soft elliptical mask: fades the sheet edges to zero so the billboard
  // never shows a rectangular cutout (fully blurry silhouette like the sun). ---
  ctx.globalCompositeOperation = "destination-in";
  const mask = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, W * 0.52);
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(0.55, "rgba(0,0,0,0.9)");
  mask.addColorStop(0.8, "rgba(0,0,0,0.38)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = mask;
  // Elliptical coverage: scale the fill so vertical falloff is tighter.
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(1, H / W);
  ctx.translate(-W / 2, -H / 2);
  ctx.fillRect(0, -H, W, H * 3);
  ctx.restore();

  ctx.globalCompositeOperation = "source-over";

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

interface Cloud {
  bx: number;
  by: number;
  bz: number;
  variant: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  drift: number;
  bobPhase: number;
  bobAmp: number;
}

export default function Sky({ worldRef }: { worldRef: RefObject<GameWorld> }) {
  const sunRef = useRef<THREE.DirectionalLight>(null!);
  const moonRef = useRef<THREE.DirectionalLight>(null!);
  const hemiRef = useRef<THREE.HemisphereLight>(null!);
  const domeRef = useRef<THREE.Mesh>(null!);
  const sunSprite = useRef<THREE.Sprite>(null!);
  const moonSprite = useRef<THREE.Sprite>(null!);
  const starsRef = useRef<THREE.Points>(null!);
  const cloudRefs = useRef<(THREE.Sprite | null)[]>([]);
  const elapsedRef = useRef(0);
  const scratchTarget = useMemo(() => new THREE.Object3D(), []);

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
  const cloudTexs = useMemo(
    () =>
      typeof document === "undefined"
        ? null
        : Array.from({ length: CLOUD_VARIANTS }, (_, i) => makeFluffyCloudTexture(1234 + i * 777)),
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

  const clouds = useMemo<Cloud[]>(() => {
    let s = 4242;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    const list: Cloud[] = [];
    for (let c = 0; c < CLOUD_COUNT; c++) {
      const wide = rand() < 0.3; // a few big hero clouds, rest mid-size
      const sx = wide ? 70 + rand() * 40 : 38 + rand() * 34;
      list.push({
        bx: (rand() - 0.5) * 560,
        by: 72 + rand() * 58,
        bz: (rand() - 0.5) * 560,
        variant: Math.floor(rand() * CLOUD_VARIANTS),
        scaleX: sx,
        scaleY: sx * (0.38 + rand() * 0.14),
        opacity: 0.55 + rand() * 0.35,
        drift: 0.7 + rand() * 0.6,
        bobPhase: rand() * Math.PI * 2,
        bobAmp: 0.8 + rand() * 1.6,
      });
    }
    // Far -> near sort helps transparent blending stability.
    list.sort((a, b) => b.by - a.by);
    return list;
  }, []);

  // Scratch colors (never reallocated in the frame loop).
  const tmpCloud = useMemo(() => new THREE.Color(), []);
  const tmpLight = useMemo(() => new THREE.Color(), []);
  const tmpTop = useMemo(() => new THREE.Color(), []);

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
    // Shadows must never "stop": day uses the sun caster, night uses the
    // moon caster (previously the moon cast no shadow, so all 3D shadows
    // vanished at night). Toggle so only the active key light pays the
    // shadow-map cost.
    sunRef.current.castShadow = sample.sunI > 0.05;
    moonRef.current.castShadow = sample.moonI > 0.05;
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

    // Fluffy billboard clouds: same soft-sprite language as the sun.
    if (!world.paused) elapsedRef.current += dt;
    const t = elapsedRef.current;
    tmpLight.set(sample.light);
    tmpTop.set(sample.top);
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      const sp = cloudRefs.current[i];
      if (!sp) continue;
      const driftX = (t * 2 * c.drift) % 560;
      let dx = (c.bx + driftX - focus.x) % 560;
      if (dx > 280) dx -= 560;
      if (dx < -280) dx += 560;
      let dz = (c.bz - focus.z) % 560;
      if (dz > 280) dz -= 560;
      if (dz < -280) dz += 560;
      const bobY = Math.sin(t * 0.12 * c.drift + c.bobPhase) * c.bobAmp;
      sp.position.set(focus.x + dx, c.by + bobY, focus.z + dz);
      const mat = sp.material as THREE.SpriteMaterial;
      // Day: white kissed by the key-light tint; night: sink toward sky top.
      tmpCloud.set("#ffffff").lerp(tmpLight, 0.28 * (1 - night));
      tmpCloud.lerp(tmpTop, night * 0.72);
      mat.color.copy(tmpCloud);
      mat.opacity = c.opacity * (1 - night * 0.62);
    }
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
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
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
      <directionalLight
        ref={moonRef}
        intensity={0}
        color="#a8c0ff"
        target={scratchTarget}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={1}
        shadow-camera-far={400}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
      <primitive object={scratchTarget} />
      {cloudTexs &&
        clouds.map((c, i) => (
          <sprite
            key={i}
            ref={(sp) => {
              cloudRefs.current[i] = sp;
            }}
            scale={[c.scaleX, c.scaleY, 1]}
          >
            <spriteMaterial
              map={cloudTexs[c.variant]}
              transparent
              opacity={c.opacity}
              depthWrite={false}
              fog={false}
            />
          </sprite>
        ))}
    </group>
  );
}
