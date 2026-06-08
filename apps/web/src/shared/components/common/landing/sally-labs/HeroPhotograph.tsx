'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

/**
 * Variant I — "Hero photograph"
 *
 * One absurdly well-shot still: 18-wheeler at golden hour, cool-graded,
 * monochrome treatment. SALLY sits on top. Subtle Ken-Burns scale on load.
 *
 * Photos are hot-linked from Unsplash (free, licensed for commercial use).
 * Three rotating options so we can compare.
 */
export function HeroPhotograph() {
  const photos = [
    {
      id: 'highway',
      url: '/hero-lab/truck-highway.jpg',
      credit: 'Unsplash',
      label: 'Truck on highway',
    },
    {
      id: 'profile',
      url: '/hero-lab/truck-profile.jpg',
      credit: 'Unsplash',
      label: 'Truck side profile',
    },
    {
      id: 'dusk',
      url: '/hero-lab/truck-dusk.jpg',
      credit: 'Unsplash',
      label: 'Truck at dusk',
    },
  ];
  const [idx, setIdx] = useState(0);
  const photo = photos[idx];

  return (
    <div className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden bg-black">
      {/* Background photo with Ken-Burns slow zoom */}
      <motion.div
        key={photo.id}
        initial={{ scale: 1.08, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          scale: { duration: 18, ease: 'linear' },
          opacity: { duration: 1.2, ease: [0.25, 0.1, 0.25, 1] },
        }}
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${photo.url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          // Monochrome grade — pulls toward our brand
          filter: 'grayscale(1) contrast(1.1) brightness(0.85)',
        }}
      />

      {/* Cool tone overlay — pushes the grade toward "premium fleet ops" */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/70" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.9) 100%)',
        }}
      />

      {/* Photo switcher — small chips bottom-right */}
      <div className="absolute bottom-6 right-6 z-30 flex items-center gap-2">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setIdx(i)}
            aria-label={`Switch to ${p.label}`}
            className={`h-2 rounded-full transition-all ${
              i === idx ? 'w-8 bg-white' : 'w-2 bg-white/40 hover:bg-white/70'
            }`}
          />
        ))}
        <span className="ml-3 font-mono text-[10px] tracking-[0.3em] uppercase text-white/50">{photo.credit}</span>
      </div>

      {/* SALLY */}
      <div className="relative z-10 text-center px-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="font-mono text-[10px] tracking-[0.5em] uppercase text-white/60 mb-8"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/80 mr-3 align-middle animate-pulse" />
          for the people who move america
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, filter: 'blur(40px)', scale: 0.94 }}
          animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
          transition={{ duration: 1.6, delay: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="font-space-grotesk text-[20vw] md:text-[16vw] lg:text-[13vw] font-extrabold tracking-[-0.05em] leading-[0.85] text-white select-none"
          style={{ textShadow: '0 4px 30px rgba(0,0,0,0.5)' }}
        >
          SALLY
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.6 }}
          className="mt-8 text-sm md:text-base text-white/85 font-light"
        >
          Your fleet is already speaking. <span className="font-medium">SALLY listens.</span>
        </motion.p>
      </div>
    </div>
  );
}
