'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

/**
 * Variant G — "Generative gradient mesh"
 *
 * Hand-written WebGL fragment shader: continuously morphing gradient mesh
 * with soft noise. Brand-monochrome with a faint steel-blue undertone.
 * Gemini/Apple Intelligence aesthetic. Zero deps.
 */
export function HeroGradientMesh() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    // Full-screen triangle (no vertex buffer trick)
    const vert = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    // The mesh — multiple animated radial blobs blended in screen space
    const frag = `
      precision highp float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2 u_res;
      uniform vec2 u_mouse;
      uniform float u_dark;

      // simplex-ish smooth noise
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      vec3 palette(float t) {
        // Monochrome with subtle steel-blue undertone
        vec3 base = vec3(0.93, 0.94, 0.96);
        vec3 mid  = vec3(0.72, 0.76, 0.82);
        vec3 deep = vec3(0.42, 0.48, 0.58);
        vec3 c = mix(base, mid, smoothstep(0.0, 0.6, t));
        c = mix(c, deep, smoothstep(0.5, 1.0, t));
        return c;
      }

      vec3 paletteDark(float t) {
        vec3 deep = vec3(0.05, 0.06, 0.08);
        vec3 mid  = vec3(0.15, 0.18, 0.24);
        vec3 hi   = vec3(0.35, 0.42, 0.52);
        vec3 c = mix(deep, mid, smoothstep(0.0, 0.6, t));
        c = mix(c, hi, smoothstep(0.6, 1.0, t));
        return c;
      }

      void main() {
        vec2 uv = v_uv;
        float aspect = u_res.x / u_res.y;
        vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

        float t = u_time * 0.06;

        // Four moving blob centers
        vec2 b1 = vec2(sin(t * 1.3) * 0.4, cos(t * 1.1) * 0.3) + u_mouse * 0.15;
        vec2 b2 = vec2(cos(t * 0.9 + 1.0) * 0.45, sin(t * 1.5 + 2.0) * 0.35);
        vec2 b3 = vec2(sin(t * 0.7 + 3.0) * 0.5, cos(t * 0.8 + 4.0) * 0.4);
        vec2 b4 = vec2(cos(t * 1.2 + 5.0) * 0.35, sin(t * 1.0 + 6.0) * 0.45);

        float d1 = 1.0 - smoothstep(0.0, 0.7, length(p - b1));
        float d2 = 1.0 - smoothstep(0.0, 0.7, length(p - b2));
        float d3 = 1.0 - smoothstep(0.0, 0.7, length(p - b3));
        float d4 = 1.0 - smoothstep(0.0, 0.7, length(p - b4));

        float field = d1 * 0.9 + d2 * 0.7 + d3 * 0.8 + d4 * 0.6;
        field += noise(p * 3.0 + t * 2.0) * 0.15;
        field = clamp(field, 0.0, 1.0);

        vec3 color = mix(palette(field), paletteDark(field), u_dark);

        // Subtle film grain
        float grain = (hash(uv * u_res + u_time) - 0.5) * 0.025;
        color += grain;

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
      }
      return s;
    };

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // Two triangles filling clip space
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');
    const uDark = gl.getUniformLocation(prog, 'u_dark');

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: MouseEvent) => {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('mousemove', onMove);

    const start = performance.now();
    let rafId = 0;
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      const isDark = document.documentElement.classList.contains('dark') ? 1 : 0;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uDark, isDark);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafId = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <div className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Soft vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 30%, hsl(var(--background) / 0.3) 80%, hsl(var(--background) / 0.6) 100%)',
        }}
      />

      <div className="relative z-10 text-center px-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="font-mono text-[10px] tracking-[0.5em] uppercase text-foreground/60 mb-8"
        >
          ai · listening · always
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, filter: 'blur(40px)', scale: 0.94 }}
          animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
          transition={{ duration: 1.6, delay: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="font-space-grotesk text-[20vw] md:text-[16vw] lg:text-[13vw] font-extrabold tracking-[-0.05em] leading-[0.85] text-foreground select-none"
        >
          SALLY
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.6 }}
          className="mt-8 text-xs md:text-sm tracking-[0.4em] uppercase text-foreground/70"
        >
          Your fleet is already speaking. SALLY listens.
        </motion.p>
      </div>
    </div>
  );
}
