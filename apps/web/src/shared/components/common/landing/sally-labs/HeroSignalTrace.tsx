'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

/**
 * Variant C — Signal-traced SALLY
 *
 * SALLY is drawn as if by a continuous GPS plotter — letters stroke-in
 * one path-segment at a time, with tiny telemetry pings lighting up
 * at anchor points (HOS, fuel, weather). Tagline types in like a dispatch log.
 */
export function HeroSignalTrace() {
  // Cursor for the typing tagline
  const [taglineChars, setTaglineChars] = useState(0);
  const tagline = 'your fleet is already speaking. sally listens.';

  useEffect(() => {
    const t = setTimeout(() => {
      let i = 0;
      const id = setInterval(() => {
        i++;
        setTaglineChars(i);
        if (i >= tagline.length) clearInterval(id);
      }, 35);
      return () => clearInterval(id);
    }, 3200);
    return () => clearTimeout(t);
  }, []);

  // Telemetry pings — appear at the corners of letters as the trace passes
  const pings = [
    { x: 130, y: 70, label: 'hos · 4.2h', delay: 0.8 },
    { x: 360, y: 70, label: 'route · i-40', delay: 1.4 },
    { x: 520, y: 70, label: 'fuel · $3.42', delay: 1.9 },
    { x: 700, y: 70, label: 'wx · gusts 23', delay: 2.4 },
    { x: 920, y: 70, label: 'eta · on-time', delay: 2.9 },
  ];

  return (
    <div className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden bg-background">
      <div className="relative w-full px-4">
        <svg viewBox="0 0 1200 360" className="w-full h-auto max-w-[1400px] mx-auto" aria-label="SALLY" role="img">
          {/* Telemetry pings — anchor markers */}
          {pings.map((p) => (
            <motion.g
              key={p.label}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: p.delay, ease: 'backOut' }}
            >
              {/* outer ping ring — uses r animation (CSS scale on SVG sub-elements is buggy) */}
              <motion.circle
                cx={p.x}
                cy={p.y}
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                className="text-foreground/30"
                initial={{ r: 6, opacity: 0.6 }}
                animate={{ r: 14, opacity: 0 }}
                transition={{ duration: 1.8, delay: p.delay, repeat: Infinity, ease: 'easeOut' }}
              />
              {/* inner dot */}
              <circle cx={p.x} cy={p.y} r="2" className="fill-foreground" />
              {/* leader line */}
              <line
                x1={p.x}
                y1={p.y + 4}
                x2={p.x}
                y2={p.y + 24}
                stroke="currentColor"
                strokeWidth="1"
                className="text-foreground/30"
              />
              {/* label */}
              <text
                x={p.x}
                y={p.y - 12}
                textAnchor="middle"
                className="font-mono fill-foreground/60"
                style={{ fontSize: '11px', letterSpacing: '0.1em' }}
              >
                {p.label}
              </text>
            </motion.g>
          ))}

          {/* SALLY — outlined letters that "fill in" left-to-right via a clipPath wipe */}
          <defs>
            <clipPath id="sally-wipe">
              <motion.rect
                x="0"
                y="100"
                height="220"
                className="fill-foreground"
                initial={{ width: 0 }}
                animate={{ width: 1200 }}
                transition={{ duration: 2.6, delay: 0.8, ease: [0.65, 0, 0.35, 1] }}
              />
            </clipPath>
          </defs>
          {/* outline layer — always visible */}
          <text
            x="600"
            y="290"
            textAnchor="middle"
            className="font-space-grotesk"
            style={{
              fontSize: '320px',
              fontWeight: 800,
              letterSpacing: '-0.04em',
              fill: 'transparent',
              stroke: 'currentColor',
              strokeWidth: 1.5,
            }}
          >
            SALLY
          </text>
          {/* solid layer — clipped to the wipe rect */}
          <g clipPath="url(#sally-wipe)">
            <text
              x="600"
              y="290"
              textAnchor="middle"
              className="font-space-grotesk fill-foreground"
              style={{
                fontSize: '320px',
                fontWeight: 800,
                letterSpacing: '-0.04em',
              }}
            >
              SALLY
            </text>
          </g>

          {/* GPS trace line that "draws" the word — abstract polyline above the letters */}
          <motion.polyline
            points="80,200 200,140 280,240 400,140 480,240 560,140 640,140 720,240 800,140 880,200 1020,160 1120,200"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-foreground/40"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.4 }}
            transition={{
              pathLength: { duration: 2.4, delay: 0.8, ease: [0.65, 0, 0.35, 1] },
              opacity: { duration: 0.6, delay: 0.8 },
            }}
          />

          {/* Plotter pen head — small filled triangle following the end of the trace */}
          <motion.g
            initial={{ opacity: 0, offsetDistance: '0%' }}
            animate={{ opacity: [0, 1, 1, 0], offsetDistance: '100%' }}
            transition={{ duration: 2.4, delay: 0.8, ease: [0.65, 0, 0.35, 1] }}
            style={{
              offsetPath:
                "path('M 80 200 L 200 140 L 280 240 L 400 140 L 480 240 L 560 140 L 640 140 L 720 240 L 800 140 L 880 200 L 1020 160 L 1120 200')",
              offsetRotate: '0deg',
            }}
          >
            <circle cx="0" cy="0" r="4" className="fill-foreground" />
            <circle cx="0" cy="0" r="10" className="fill-foreground" opacity="0.15" />
          </motion.g>
        </svg>
      </div>

      {/* Tagline — dispatch log style, types in */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 3.1 }}
        className="mt-10 font-mono text-xs md:text-sm text-foreground/70 flex items-center gap-2 px-4"
      >
        <span className="text-foreground/40">&gt;</span>
        <span>{tagline.slice(0, taglineChars)}</span>
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
          className="inline-block w-[7px] h-[14px] bg-foreground/70"
        />
      </motion.div>
    </div>
  );
}
