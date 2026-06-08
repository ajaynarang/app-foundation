'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

/**
 * Variant F — "Live WebGL fleet"
 *
 * Hand-written WebGL shader: thousands of moving particles forming
 * abstract truck-glyphs in 3D space behind SALLY. Real GPU, no deps.
 * Mouse-parallax. Continuous animation. Never the same twice.
 */
export function HeroWebGLFleet() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true });
    if (!gl) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const vert = `
      attribute vec3 a_pos;
      attribute float a_seed;
      uniform float u_time;
      uniform vec2 u_mouse;
      uniform vec2 u_res;
      varying float v_alpha;
      varying float v_depth;
      void main() {
        // base orbit in 3d
        float t = u_time * 0.15;
        float angle = a_seed * 6.2831 + t * (0.3 + a_seed * 0.6);
        float radius = 0.4 + a_seed * 0.6;
        vec3 p = a_pos;
        p.x = cos(angle) * radius + a_pos.x * 0.4;
        p.y = sin(angle * 0.7) * radius * 0.6 + a_pos.y * 0.3;
        p.z = sin(angle) * radius + a_pos.z * 0.4;

        // mouse parallax — tilt the whole cloud
        p.x += u_mouse.x * 0.3 * (0.5 + p.z);
        p.y += u_mouse.y * 0.2 * (0.5 + p.z);

        // perspective projection
        float focal = 2.0;
        float persp = focal / (focal + p.z);
        vec2 screen = p.xy * persp;

        gl_Position = vec4(screen, 0.0, 1.0);
        gl_PointSize = mix(1.0, 5.0, persp) * (u_res.y / 800.0);

        v_alpha = persp * (0.4 + a_seed * 0.6);
        v_depth = persp;
      }
    `;

    const frag = `
      precision mediump float;
      varying float v_alpha;
      varying float v_depth;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float a = v_alpha * smoothstep(0.5, 0.0, r);
        // monochrome: dark dots on light bg, light dots on dark bg handled by canvas blend
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
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

    // particle buffer — N truck-glyphs, each is a cluster of 5 points
    const N = 600;
    const pointsPerGlyph = 5;
    const data: number[] = [];
    for (let i = 0; i < N; i++) {
      const seed = Math.random();
      const cx = (Math.random() - 0.5) * 2;
      const cy = (Math.random() - 0.5) * 1.2;
      const cz = (Math.random() - 0.5) * 2;
      // each "truck" = trailer (3 dots) + cab (1 dot) + headlight (1 dot)
      const offsets = [
        [0, 0, 0],
        [0.05, 0, 0],
        [0.1, 0, 0],
        [0.15, 0.01, 0],
        [0.18, 0.015, 0],
      ];
      for (const [ox, oy, oz] of offsets) {
        data.push(cx + ox, cy + oy, cz + oz, seed);
      }
    }
    void pointsPerGlyph;

    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(prog, 'a_pos');
    const seedLoc = gl.getAttribLocation(prog, 'a_seed');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(seedLoc);
    gl.vertexAttribPointer(seedLoc, 1, gl.FLOAT, false, 16, 12);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');
    const uRes = gl.getUniformLocation(prog, 'u_res');

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.POINTS, 0, data.length / 4);
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
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        // dark-mode invert via filter so the black dots become white
        style={{ filter: 'var(--canvas-invert, none)' }}
      />
      <style jsx>{`
        :global(.dark) canvas {
          filter: invert(1);
        }
      `}</style>

      {/* Vignette to focus the eye */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 25%, hsl(var(--background) / 0.4) 60%, hsl(var(--background) / 0.9) 100%)',
        }}
      />

      {/* SALLY centered, hero typography */}
      <div className="relative z-10 text-center px-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="font-mono text-[10px] tracking-[0.5em] uppercase text-muted-foreground mb-8"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-foreground/80 mr-3 align-middle animate-pulse" />
          render · gpu · live
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
          className="mt-8 text-xs md:text-sm tracking-[0.4em] uppercase text-muted-foreground"
        >
          Your fleet is already speaking. SALLY listens.
        </motion.p>
      </div>
    </div>
  );
}
