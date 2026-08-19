import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

import { COMPANION_ORDER, COMPANION_WORLD_COLORS } from "@/lib/agents";
import type { OrbState, TonyWorldHandle } from "@/lib/worldApi";

// Converts an oklch(L C H) triple to a #rrggbb sRGB hex string. THREE.Color's
// CSS parser only understands rgb()/hsl()/hex/named colors, not oklch() —
// and modern browsers' canvas 2D fillStyle now preserves oklch() verbatim
// instead of normalizing it, so we do the OKLab -> linear sRGB -> sRGB
// conversion by hand (standard CSS Color 4 matrices).
function oklchToHex(l: number, c: number, hDeg: number): string {
  const hRad = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;

  const rLin = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  const toSrgb = (v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    const encoded =
      clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
  };

  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(toSrgb(rLin))}${toHex(toSrgb(gLin))}${toHex(toSrgb(bLin))}`;
}

// Resolves a CSS custom property (a design token, defined as oklch()) to a
// #rrggbb hex string THREE.Color can parse.
function cssVar(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return "#7C5CFF";
  const match = raw.match(/oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/);
  if (match) {
    const l = match[2] === "%" ? Number(match[1]) / 100 : Number(match[1]);
    return oklchToHex(l, Number(match[3]), Number(match[4]));
  }
  return raw;
}

interface WorldViewProps {
  initialName: string;
  onUnavailable: () => void;
}

/**
 * Isolated Three.js scene: companions arranged in a tilted ring around a
 * glowing core sphere, orbiting particle band, restrained bloom,
 * OrbitControls with auto-rotate, screen-space label decluttering, and an
 * imperative API (setState/setAmp/pulseCompanion/broadcastPulse/flashAlert/
 * pulseFinal/setName) that the rest of the UI drives. Ported from the
 * original CDN-module implementation into a proper `three` npm dependency,
 * wired into React via forwardRef + useImperativeHandle. The scene's
 * internal logic/tuning is intentionally unchanged.
 */
const WorldView = forwardRef<TonyWorldHandle, WorldViewProps>(function WorldView(
  { initialName, onUnavailable },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const tonyLabelTextRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<TonyWorldHandle | null>(null);

  useImperativeHandle(ref, () => ({
    setState: (s) => apiRef.current?.setState(s),
    setAmp: (v) => apiRef.current?.setAmp(v),
    pulseCompanion: (n) => apiRef.current?.pulseCompanion(n),
    broadcastPulse: () => apiRef.current?.broadcastPulse(),
    flashAlert: (n) => apiRef.current?.flashAlert(n),
    pulseFinal: () => apiRef.current?.pulseFinal(),
    setName: (n) => apiRef.current?.setName(n),
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const labelLayer = labelLayerRef.current;
    if (!canvas || !labelLayer) return;
    if (!window.WebGLRenderingContext) {
      onUnavailable();
      return;
    }

    let renderer: THREE.WebGLRenderer;
    let raf = 0;
    let disposed = false;
    let themeObserver: MutationObserver | null = null;
    const cleanupFns: Array<() => void> = [];

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        46,
        window.innerWidth / window.innerHeight,
        0.1,
        100
      );
      camera.position.set(0.5, 5.4, 12.5);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.minDistance = 8;
      controls.maxDistance = 22;
      controls.minPolarAngle = Math.PI * 0.18;
      controls.maxPolarAngle = Math.PI * 0.62;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.28;
      controls.target.set(0, 0.2, 0);
      controls.addEventListener("start", () => {
        controls.autoRotate = false;
        hintRef.current?.classList.remove("show");
      });

      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.55,
        0.4,
        0.82
      );
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());

      scene.add(new THREE.AmbientLight(0xffffff, 0.4));
      const keyLight = new THREE.PointLight(0xffffff, 0.9, 40);
      keyLight.position.set(5, 9, 7);
      scene.add(keyLight);
      const fillLight = new THREE.PointLight(0x88aaff, 0.35, 40);
      fillLight.position.set(-6, -3, -5);
      scene.add(fillLight);

      const bandGroup = new THREE.Group();
      bandGroup.rotation.x = Math.PI * 0.42;
      bandGroup.rotation.z = 0.15;
      scene.add(bandGroup);
      {
        const count = 260;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          const r = 7.6 + (Math.random() - 0.5) * 0.9;
          const a = Math.random() * Math.PI * 2;
          pos[i * 3] = Math.cos(a) * r;
          pos[i * 3 + 1] = (Math.random() - 0.5) * 0.25;
          pos[i * 3 + 2] = Math.sin(a) * r;
        }
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
          color: new THREE.Color(cssVar("--accent")),
          size: 0.05,
          transparent: true,
          opacity: 0.4,
          sizeAttenuation: true,
        });
        bandGroup.add(new THREE.Points(geo, mat));
      }

      const tonyGroup = new THREE.Group();
      scene.add(tonyGroup);

      const coreMat = new THREE.MeshStandardMaterial({
        color: 0xf4f7ff,
        emissive: new THREE.Color(cssVar("--accent")),
        emissiveIntensity: 0.35,
        roughness: 0.3,
        metalness: 0.1,
      });
      const tony = new THREE.Mesh(new THREE.SphereGeometry(1.05, 48, 48), coreMat);
      tonyGroup.add(tony);

      const rimMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(cssVar("--accent")),
        transparent: true,
        opacity: 0.35,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      });
      const rim = new THREE.Mesh(new THREE.SphereGeometry(1.18, 48, 48), rimMat);
      tonyGroup.add(rim);

      const tonyLight = new THREE.PointLight(new THREE.Color(cssVar("--accent")), 1.1, 10);
      tonyGroup.add(tonyLight);

      const listenRing = new THREE.Mesh(
        new THREE.RingGeometry(1.4, 1.5, 64),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(cssVar("--accent")),
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
        })
      );
      listenRing.rotation.x = Math.PI / 2;
      scene.add(listenRing);

      const radius = 5.6;
      interface Companion {
        mesh: THREE.Mesh;
        mat: THREE.MeshStandardMaterial;
        baseColor: THREE.Color;
        angle: number;
        baseY: number;
        phase: number;
        entranceDelay: number;
        pulseUntil?: number | null;
        alertUntil?: number | null;
      }
      const companions: Record<string, Companion> = {};
      const labelEls: Record<string, HTMLDivElement> = {};

      const tonyLabel = document.createElement("div");
      tonyLabel.className = "world-label world-label-tony";
      const initialClean = (initialName || "Tony").replace(/[<>]/g, "");
      tonyLabel.innerHTML = `<span class="world-label-dot" style="background:${cssVar(
        "--accent"
      )}"></span><span data-tony-label-text>${initialClean}</span>`;
      labelLayer.appendChild(tonyLabel);
      const tonyLabelTextEl = tonyLabel.querySelector<HTMLSpanElement>(
        "[data-tony-label-text]"
      );
      if (tonyLabelTextEl) tonyLabelTextRef.current = tonyLabelTextEl;

      COMPANION_ORDER.forEach((name, i) => {
        const angle = (i / COMPANION_ORDER.length) * Math.PI * 2;
        const color = new THREE.Color(COMPANION_WORLD_COLORS[name]);
        const mat = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.35,
          roughness: 0.4,
        });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 24), mat);
        const tiltY = Math.sin(angle * 2) * 0.55;
        mesh.position.set(Math.cos(angle) * radius, tiltY, Math.sin(angle) * radius);
        mesh.scale.setScalar(0.001);
        scene.add(mesh);

        const label = document.createElement("div");
        label.className = "world-label";
        label.innerHTML = `<span class="world-label-dot" style="background:${COMPANION_WORLD_COLORS[name]}"></span><span>${name}</span>`;
        label.style.opacity = "0";
        labelLayer.appendChild(label);
        labelEls[name] = label;

        companions[name] = {
          mesh,
          mat,
          baseColor: color.clone(),
          angle,
          baseY: tiltY,
          phase: i * 1.7,
          entranceDelay: i * 60,
        };
      });

      const activeBeams: Array<{ line: THREE.Line; mat: THREE.LineBasicMaterial; life: number }> =
        [];
      function fireBeam(companionName: string) {
        const c = companions[companionName];
        if (!c) return;
        const points = [tonyGroup.position.clone(), c.mesh.position.clone()];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({
          color: c.baseColor,
          transparent: true,
          opacity: 0.85,
        });
        const line = new THREE.Line(geo, mat);
        scene.add(line);
        activeBeams.push({ line, mat, life: 1.0 });
        c.mat.emissiveIntensity = 1.3;
        c.pulseUntil = performance.now() + 900;
      }

      let broadcastActive: { start: number; mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } | null =
        null;
      function broadcastPulse() {
        const mat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(cssVar("--accent")),
          transparent: true,
          opacity: 0.45,
          wireframe: true,
        });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 24), mat);
        scene.add(mesh);
        broadcastActive = { start: performance.now(), mesh, mat };
      }

      let finalPulseUntil = 0;
      function pulseFinal() {
        finalPulseUntil = performance.now() + 1400;
      }

      function flashAlert(companionName: string) {
        const c = companions[companionName];
        if (!c) return;
        c.mat.color.set("#E05A5A");
        c.mat.emissive.set("#E05A5A");
        c.mat.emissiveIntensity = 1.5;
        c.alertUntil = performance.now() + 1800;
      }

      let orbState: OrbState = "idle";
      let amp = 0;
      function setState(s: OrbState) {
        orbState = s;
      }
      function setAmp(v: number) {
        amp = v;
      }
      function setName(name: string) {
        if (tonyLabelTextRef.current) tonyLabelTextRef.current.textContent = name || "Tony";
      }

      apiRef.current = {
        setState,
        setAmp,
        pulseCompanion: fireBeam,
        broadcastPulse,
        flashAlert,
        pulseFinal,
        setName,
      };

      const startTime = performance.now();
      let t = 0;
      const _v = new THREE.Vector3();

      function projectLabel(
        el: HTMLDivElement & { _tx?: number; _ty?: number; _behind?: boolean },
        worldPos: THREE.Vector3,
        offsetY: number
      ) {
        _v.copy(worldPos);
        _v.y += offsetY;
        _v.project(camera);
        const behind = _v.z > 1;
        const x = (_v.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-_v.y * 0.5 + 0.5) * window.innerHeight;
        el._tx = x;
        el._ty = y;
        el._behind = behind;
      }

      function declutterLabels() {
        const els = Object.values(labelEls).concat([tonyLabel]);
        for (let iter = 0; iter < 3; iter++) {
          for (let i = 0; i < els.length; i++) {
            for (let j = i + 1; j < els.length; j++) {
              const a = els[i] as HTMLDivElement & { _tx?: number; _ty?: number };
              const b = els[j] as HTMLDivElement & { _tx?: number; _ty?: number };
              const dx = (b._tx ?? 0) - (a._tx ?? 0);
              const dy = (b._ty ?? 0) - (a._ty ?? 0);
              const dist = Math.hypot(dx, dy) || 0.01;
              const minDist = 46;
              if (dist < minDist) {
                const push = (minDist - dist) / 2;
                const nx = dx / dist,
                  ny = dy / dist;
                a._tx = (a._tx ?? 0) - nx * push;
                a._ty = (a._ty ?? 0) - ny * push;
                b._tx = (b._tx ?? 0) + nx * push;
                b._ty = (b._ty ?? 0) + ny * push;
              }
            }
          }
        }
      }

      function animate() {
        raf = requestAnimationFrame(animate);
        t += 0.016;
        controls.update();

        let targetScale = 1 + Math.sin(t * 1.1) * 0.025;
        let intensity = 0.35;
        if (orbState === "listening") {
          targetScale = 1 + amp * 0.26;
          intensity = 0.7;
        } else if (orbState === "thinking") {
          targetScale = 1 + Math.sin(t * 6) * 0.05;
          intensity = 0.9;
        } else if (orbState === "speaking") {
          targetScale = 1 + amp * 0.2;
          intensity = 0.8;
        }
        if (performance.now() < finalPulseUntil) {
          const p = 1 - (finalPulseUntil - performance.now()) / 1400;
          targetScale = 1 + Math.sin(p * Math.PI) * 0.3;
          intensity = 0.35 + Math.sin(p * Math.PI) * 1.0;
        }
        tonyGroup.scale.x += (targetScale - tonyGroup.scale.x) * 0.15;
        tonyGroup.scale.y = tonyGroup.scale.z = tonyGroup.scale.x;
        coreMat.emissiveIntensity += (intensity - coreMat.emissiveIntensity) * 0.1;
        tonyGroup.rotation.y += 0.0018;

        listenRing.material.opacity +=
          ((orbState === "listening" ? 0.5 : 0) - listenRing.material.opacity) * 0.1;
        listenRing.scale.setScalar(1 + Math.sin(t * 2) * 0.06);

        const now = performance.now();
        const elapsedMs = now - startTime;
        COMPANION_ORDER.forEach((name) => {
          const c = companions[name];
          const y = c.baseY + Math.sin(t * 0.7 + c.phase) * 0.3;
          c.mesh.position.y = y;
          c.mesh.rotation.y += 0.008;

          if (elapsedMs > c.entranceDelay) {
            const growTarget = 1;
            c.mesh.scale.x += (growTarget - c.mesh.scale.x) * 0.08;
            c.mesh.scale.y = c.mesh.scale.z = c.mesh.scale.x;
            labelEls[name].style.opacity = String(
              Math.min(1, (elapsedMs - c.entranceDelay) / 400)
            );
          }

          if (c.alertUntil && now > c.alertUntil) {
            c.mat.color.copy(c.baseColor);
            c.mat.emissive.copy(c.baseColor);
            c.alertUntil = null;
          }
          const targetIntensity = c.pulseUntil && now < c.pulseUntil ? 1.3 : c.alertUntil ? 1.5 : 0.35;
          c.mat.emissiveIntensity += (targetIntensity - c.mat.emissiveIntensity) * 0.12;

          projectLabel(labelEls[name], c.mesh.position, 0.55);
        });
        projectLabel(tonyLabel, tonyGroup.position, 1.55);
        declutterLabels();
        Object.entries(labelEls).forEach(([, el]) => {
          const ex = el as HTMLDivElement & { _tx?: number; _ty?: number; _behind?: boolean };
          el.style.transform = `translate3d(${ex._tx}px, ${ex._ty}px, 0) translate(-50%,-50%)`;
          el.style.visibility = ex._behind ? "hidden" : "visible";
        });
        const tl = tonyLabel as HTMLDivElement & { _tx?: number; _ty?: number; _behind?: boolean };
        tonyLabel.style.transform = `translate3d(${tl._tx}px, ${tl._ty}px, 0) translate(-50%,-50%)`;
        tonyLabel.style.visibility = tl._behind ? "hidden" : "visible";

        for (let i = activeBeams.length - 1; i >= 0; i--) {
          const b = activeBeams[i];
          b.life -= 0.02;
          b.mat.opacity = Math.max(0, b.life) * 0.85;
          if (b.life <= 0) {
            scene.remove(b.line);
            activeBeams.splice(i, 1);
          }
        }

        if (broadcastActive) {
          const elapsed = (performance.now() - broadcastActive.start) / 1000;
          broadcastActive.mesh.scale.setScalar(1 + elapsed * 5.5);
          broadcastActive.mat.opacity = Math.max(0, 0.45 - elapsed * 0.55);
          if (elapsed > 1) {
            scene.remove(broadcastActive.mesh);
            broadcastActive = null;
          }
        }

        bandGroup.rotation.y += 0.0006;
        composer.render();
      }
      animate();

      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("resize", onResize);
      cleanupFns.push(() => window.removeEventListener("resize", onResize));

      themeObserver = new MutationObserver(() => {
        const accent = new THREE.Color(cssVar("--accent"));
        coreMat.emissive.copy(accent);
        rimMat.color.copy(accent);
        tonyLight.color.copy(accent);
        (listenRing.material as THREE.MeshBasicMaterial).color.copy(accent);
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });

      hintRef.current?.classList.add("show");

      cleanupFns.push(() => {
        Object.values(labelEls).forEach((el) => el.remove());
        tonyLabel.remove();
        controls.dispose();
        renderer.dispose();
        composer.dispose();
      });
    } catch (err) {
      console.warn("[Tony] 3D World View unavailable, falling back to flat orb:", err);
      onUnavailable();
      return;
    }

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      themeObserver?.disconnect();
      cleanupFns.forEach((fn) => fn());
      void disposed;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        id="worldCanvas"
        className="fixed inset-0 z-0 block touch-none"
      />
      <div
        ref={hintRef}
        className="pointer-events-none fixed bottom-[82px] left-1/2 z-[5] -translate-x-1/2 rounded-xl border border-border bg-[var(--surface)] px-3 py-1 text-[11px] text-muted-foreground opacity-0 backdrop-blur-md transition-opacity delay-[1500ms] duration-400 [&.show]:opacity-100"
      >
        drag to orbit · scroll to zoom
      </div>
      <div ref={labelLayerRef} id="labelLayer" className="pointer-events-none fixed inset-0 z-[3]" />
    </>
  );
});

export default WorldView;
