'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

/**
 * Variant D — "The Pulse Map"
 *
 * Sparse dot-stippled US outline fills the viewport. A single signal
 * ignites in Memphis, ripples outward, triggers neighboring signals,
 * cascading until the whole map is alive. SALLY emerges in the center
 * as the chain reaction completes.
 *
 * Investor read: "this is what our network looks like."
 */
export function HeroPulseMap() {
  const wrapRef = useRef<HTMLDivElement>(null);

  // Parallax on cursor
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const dx = (e.clientX - rect.left) / rect.width - 0.5;
      const dy = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.setProperty('--mx', String(dx));
      el.style.setProperty('--my', String(dy));
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Signal sites — rough freight hubs, viewBox 1400x700
  // origin Memphis, cascade radiates outward by delay
  const signals = [
    { id: 'mem', x: 760, y: 380, delay: 0.6, label: 'Memphis' },
    { id: 'lit', x: 720, y: 395, delay: 0.9 },
    { id: 'nas', x: 820, y: 360, delay: 1.0 },
    { id: 'atl', x: 880, y: 410, delay: 1.2 },
    { id: 'stl', x: 760, y: 310, delay: 1.3 },
    { id: 'dal', x: 660, y: 460, delay: 1.4 },
    { id: 'hou', x: 700, y: 510, delay: 1.6 },
    { id: 'okc', x: 640, y: 400, delay: 1.5 },
    { id: 'ind', x: 850, y: 290, delay: 1.7 },
    { id: 'chi', x: 830, y: 240, delay: 1.9 },
    { id: 'col', x: 920, y: 290, delay: 2.0 },
    { id: 'lou', x: 850, y: 320, delay: 1.6 },
    { id: 'cha', x: 960, y: 380, delay: 1.9 },
    { id: 'jax', x: 970, y: 510, delay: 2.2 },
    { id: 'mia', x: 1020, y: 580, delay: 2.5 },
    { id: 'phx', x: 360, y: 460, delay: 2.1 },
    { id: 'lax', x: 220, y: 430, delay: 2.4 },
    { id: 'sfo', x: 170, y: 340, delay: 2.5 },
    { id: 'sea', x: 250, y: 170, delay: 2.7 },
    { id: 'den', x: 510, y: 340, delay: 1.9 },
    { id: 'slc', x: 410, y: 290, delay: 2.2 },
    { id: 'kc', x: 700, y: 340, delay: 1.4 },
    { id: 'omh', x: 690, y: 290, delay: 1.7 },
    { id: 'min', x: 760, y: 200, delay: 2.0 },
    { id: 'det', x: 920, y: 230, delay: 2.1 },
    { id: 'pit', x: 1000, y: 270, delay: 2.2 },
    { id: 'phi', x: 1080, y: 290, delay: 2.4 },
    { id: 'nyc', x: 1110, y: 270, delay: 2.5 },
    { id: 'bos', x: 1160, y: 230, delay: 2.7 },
    { id: 'dc', x: 1050, y: 320, delay: 2.3 },
    { id: 'no', x: 770, y: 530, delay: 2.0 },
    { id: 'elp', x: 460, y: 510, delay: 2.4 },
    { id: 'san', x: 240, y: 480, delay: 2.7 },
  ];

  // Freight corridors — connect the major hubs as suggestive lines
  const corridors = [
    'M 220 430 L 360 460 L 510 340 L 760 380 L 1050 320 L 1110 270', // I-40-ish
    'M 240 480 L 460 510 L 700 510 L 770 530 L 1020 580', // I-10
    'M 1160 230 L 1110 270 L 1080 290 L 1050 320 L 970 510 L 1020 580', // I-95
    'M 250 170 L 410 290 L 690 290 L 830 240 L 1000 270', // I-90/I-80
  ];

  return (
    <div
      ref={wrapRef}
      className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden bg-background"
      style={{ '--mx': 0, '--my': 0 } as React.CSSProperties}
    >
      {/* The map — full-bleed background */}
      <svg
        viewBox="0 0 1400 700"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
        aria-hidden
        style={{
          transform: 'translate3d(calc(var(--mx) * -12px), calc(var(--my) * -8px), 0)',
          transition: 'transform 0.6s cubic-bezier(0.25, 0.1, 0.25, 1)',
        }}
      >
        {/* Stylized lower-48 outline — recognizable silhouette, not geographically precise */}
        <motion.path
          d="
            M 130 200
            Q 180 140 230 140
            L 320 130
            L 420 110
            L 540 105
            L 680 100
            L 820 95
            L 960 100
            L 1080 110
            L 1170 130
            L 1210 180
            L 1230 230
            L 1220 280
            L 1190 310
            L 1140 320
            L 1100 340
            L 1080 380
            L 1050 430
            L 1020 480
            L 1000 530
            L 1030 580
            L 1010 620
            L 970 600
            L 920 580
            L 870 560
            L 820 545
            L 770 540
            L 720 545
            L 660 560
            L 600 555
            L 540 530
            L 480 510
            L 420 490
            L 380 460
            L 340 430
            L 300 400
            L 260 360
            L 230 320
            L 200 290
            L 170 250
            Z
          "
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 4"
          className="text-foreground/30"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            pathLength: { duration: 2.0, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] },
            opacity: { duration: 0.6, delay: 0.2 },
          }}
        />

        {/* Freight corridors — faint, animate in after outline */}
        {corridors.map((d, i) => (
          <motion.path
            key={i}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-foreground/20"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, delay: 1.0 + i * 0.15, ease: [0.65, 0, 0.35, 1] }}
          />
        ))}

        {/* Signal nodes — chain-reaction pulses outward from Memphis */}
        {signals.map((s) => (
          <g key={s.id}>
            {/* The ripple */}
            <motion.circle
              cx={s.x}
              cy={s.y}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.8"
              className="text-foreground/60"
              initial={{ r: 3, opacity: 0 }}
              animate={{ r: [3, 28, 28], opacity: [0, 0.6, 0] }}
              transition={{ duration: 2.4, delay: s.delay, repeat: Infinity, repeatDelay: 6, ease: 'easeOut' }}
            />
            {/* Persistent dot */}
            <motion.circle
              cx={s.x}
              cy={s.y}
              r="2"
              className="fill-foreground"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: s.delay, ease: 'backOut' }}
            />
            {/* Memphis gets a label */}
            {s.label && (
              <motion.text
                x={s.x + 10}
                y={s.y + 4}
                className="font-mono fill-foreground/50"
                style={{ fontSize: '9px', letterSpacing: '0.15em' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: s.delay + 0.4 }}
              >
                {s.label.toUpperCase()}
              </motion.text>
            )}
          </g>
        ))}
      </svg>

      {/* Cinematic vignette to focus the eye on SALLY */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 30%, hsl(var(--background) / 0.5) 70%, hsl(var(--background) / 0.85) 100%)',
        }}
      />

      {/* SALLY — emerges as the chain reaction completes (~2.8s) */}
      <div className="relative z-10 text-center px-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="font-mono text-[10px] tracking-[0.5em] uppercase text-muted-foreground mb-8"
        >
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0.7, 1] }}
            transition={{ duration: 1.2, delay: 0.4, repeat: Infinity, repeatDelay: 3 }}
            className="inline-block w-1.5 h-1.5 rounded-full bg-foreground mr-3 align-middle"
          />
          live · 33 fleets active
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, filter: 'blur(40px)', scale: 0.94 }}
          animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
          transition={{ duration: 1.6, delay: 2.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="font-space-grotesk text-[20vw] md:text-[16vw] lg:text-[13vw] font-extrabold tracking-[-0.05em] leading-[0.85] text-foreground select-none"
        >
          SALLY
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 3.6 }}
          className="mt-8 text-xs md:text-sm tracking-[0.4em] uppercase text-muted-foreground"
        >
          The nervous system for American freight
        </motion.p>
      </div>
    </div>
  );
}
