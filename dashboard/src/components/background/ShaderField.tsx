// src/components/background/ShaderField.tsx
// Raw WebGL fragment shader — a slow, volumetric aurora field built from
// domain-warped fractal Brownian motion. Written from scratch rather than
// pulled from a particle/gradient library: it's ~4KB of GLSL with zero
// dependencies (three.js would have added ~150KB gzipped for a single
// fullscreen quad), and the warp/palette are tuned to this product's own
// palette rather than a library default.
//
// Performance: one fullscreen triangle, DPR capped at 1.5, the RAF loop
// stops entirely when the tab is hidden or the element scrolls out of
// view, and under prefers-reduced-motion it renders exactly one static
// frame and never starts a loop at all.
import { useEffect, useRef } from "react";

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

uniform vec2  u_resolution;
uniform float u_time;
uniform vec2  u_mouse;
uniform float u_intensity;

// -- value noise + fbm ------------------------------------------------
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8); // decorrelates octaves, kills axis-aligned banding
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = uv;
  p.x *= u_resolution.x / u_resolution.y; // aspect-correct so blooms stay round

  float t = u_time * 0.045; // deliberately slow — this is ambience, not motion graphics

  // Mouse pushes the field very gently; enough to feel alive on hover,
  // not enough to read as a cursor-follow gimmick.
  vec2 m = (u_mouse - 0.5) * 0.35;

  // -- domain warping: fbm of fbm of fbm. This is what produces the
  // liquid, layered, non-repeating look instead of flat noise. --------
  vec2 q = vec2(fbm(p + vec2(0.0, 0.0) + t * 0.5),
                fbm(p + vec2(5.2, 1.3) - t * 0.35));

  vec2 r = vec2(fbm(p + 3.5 * q + vec2(1.7, 9.2) + 0.22 * t + m),
                fbm(p + 3.5 * q + vec2(8.3, 2.8) + 0.19 * t + m));

  float f = fbm(p + 3.2 * r);

  // -- palette ---------------------------------------------------------
  vec3 canvasCol  = vec3(0.031, 0.035, 0.043); // #08090b
  vec3 violet     = vec3(0.388, 0.357, 1.000); // #635bff  brand accent
  vec3 indigo     = vec3(0.180, 0.145, 0.560);
  vec3 emerald    = vec3(0.063, 0.725, 0.506); // #10b981  healthy-state hint
  vec3 deepBlue   = vec3(0.086, 0.121, 0.290);

  vec3 col = canvasCol;

  // Broad indigo bed
  col = mix(col, deepBlue, clamp(f * f * 2.2, 0.0, 1.0));

  // Violet blooms driven by the warp magnitude — these are the "aurora"
  col = mix(col, indigo, clamp(length(q) * 0.75, 0.0, 1.0));
  col = mix(col, violet, clamp(length(r) * 0.55, 0.0, 1.0));

  // A restrained emerald filament, only in the brightest ridges, so the
  // healthy-state colour appears as a rare accent rather than a wash.
  float ridge = smoothstep(0.62, 0.95, f + length(r) * 0.25);
  col = mix(col, emerald, ridge * 0.18);

  // Specular-ish highlight along warp gradients — reads as depth/sheen
  float sheen = smoothstep(0.55, 1.0, length(r));
  col += violet * sheen * 0.10;

  // -- vignette + falloff ---------------------------------------------
  float vig = smoothstep(1.25, 0.25, length(uv - 0.5) * 1.6);
  col *= vig;

  // Top-weighted falloff so page content lower down stays legible
  col *= mix(0.55, 1.0, smoothstep(-0.15, 0.85, 1.0 - uv.y));

  col *= u_intensity;

  // Ordered-ish dither to kill 8-bit banding across these very dark ramps
  float d = hash(gl_FragCoord.xy) * 0.005;
  gl_FragColor = vec4(col + d, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("ShaderField compile failed:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

interface ShaderFieldProps {
  /** 0..1 — overall brightness. Marketing pages run hot, the Control
   * Plane runs dim so it never competes with live data. */
  intensity?: number;
}

export default function ShaderField({ intensity = 1 }: ShaderFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    }) as WebGLRenderingContext | null;

    // No WebGL (old browser, blocklisted GPU, headless): the CSS gradient
    // fallback painted by AmbientBackground stays visible underneath.
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("ShaderField link failed:", gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    // One oversized triangle covers the viewport with no seam and one
    // fewer vertex than a quad.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, "u_resolution");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uMouse = gl.getUniformLocation(program, "u_mouse");
    const uIntensity = gl.getUniformLocation(program, "u_intensity");

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const mouse = { x: 0.5, y: 0.5 };
    const target = { x: 0.5, y: 0.5 };
    const onPointer = (e: PointerEvent) => {
      target.x = e.clientX / window.innerWidth;
      target.y = 1 - e.clientY / window.innerHeight;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    gl.uniform1f(uIntensity, intensity);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const drawFrame = (timeSec: number) => {
      gl.uniform1f(uTime, timeSec);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    if (reduced) {
      // One resolved static frame, no loop, no listeners doing work.
      drawFrame(12);
      return () => {
        ro.disconnect();
        window.removeEventListener("pointermove", onPointer);
      };
    }

    let raf = 0;
    let running = true;
    const start = performance.now();

    const loop = (now: number) => {
      if (!running) return;
      // Ease the mouse so the field drifts toward the cursor rather than
      // snapping — snapping is what makes this effect read as cheap.
      mouse.x += (target.x - mouse.x) * 0.03;
      mouse.y += (target.y - mouse.y) * 0.03;
      drawFrame((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Stop burning GPU on a backgrounded tab.
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, [intensity]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
