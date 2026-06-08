'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * Variant H — "Hero video loop"
 *
 * Cinematic background video (the existing SALLY launch video, autoplay/muted/loop)
 * with a darkening grade overlay. SALLY sits on top, oversized, with one quiet tagline.
 * This is what Apple does on product pages.
 */
export function HeroVideoLoop() {
  const cdn = process.env.NEXT_PUBLIC_CDN_URL || 'https://d22th7nwxzv6hc.cloudfront.net';
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'loading' | 'playing' | 'error'>('loading');

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setStatus('playing');
    const onError = () => setStatus('error');
    const onCanPlay = () => {
      v.play()
        .then(() => setStatus('playing'))
        .catch(() => setStatus('error'));
    };
    v.addEventListener('playing', onPlay);
    v.addEventListener('error', onError);
    v.addEventListener('canplay', onCanPlay);
    // Force load — autoplay+muted can sometimes need a kick
    v.load();
    return () => {
      v.removeEventListener('playing', onPlay);
      v.removeEventListener('error', onError);
      v.removeEventListener('canplay', onCanPlay);
    };
  }, []);

  return (
    <div className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden bg-background">
      {/* Background video — mp4 first (broadest codec support), webm as fallback */}
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover"
        aria-hidden
      >
        <source src={`${cdn}/videos/sally-launch.mp4`} type="video/mp4" />
        <source src={`${cdn}/videos/sally-launch.webm`} type="video/webm" />
      </video>

      {/* Status pill (dev visibility) */}
      <div className="absolute top-6 right-24 z-40 font-mono text-[10px] tracking-[0.3em] uppercase text-white/70 bg-black/40 backdrop-blur px-3 py-1.5 rounded-full">
        video · {status}
      </div>

      {/* Cinematic grade — dark overlay + vignette */}
      <div className="absolute inset-0 bg-black/55" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.5) 75%, rgba(0,0,0,0.85) 100%)',
        }}
      />

      {/* Top-left marker */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="absolute top-20 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.5em] uppercase text-white/60 whitespace-nowrap"
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/80 mr-3 align-middle animate-pulse" />
        live · 60 seconds · sally on the road
      </motion.div>

      {/* SALLY — white over video */}
      <div className="relative z-10 text-center px-4">
        <motion.h1
          initial={{ opacity: 0, filter: 'blur(40px)', scale: 0.94 }}
          animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
          transition={{ duration: 1.6, delay: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          className="font-space-grotesk text-[20vw] md:text-[16vw] lg:text-[13vw] font-extrabold tracking-[-0.05em] leading-[0.85] text-white select-none drop-shadow-2xl"
        >
          SALLY
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.4 }}
          className="mt-8 text-xs md:text-sm tracking-[0.4em] uppercase text-white/80"
        >
          Your fleet is already speaking. SALLY listens.
        </motion.p>
      </div>

      {/* Watch full demo — bottom CTA */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 2 }}
        className="absolute bottom-12 left-1/2 -translate-x-1/2 group inline-flex items-center gap-3 rounded-full border border-white/30 bg-white/10 backdrop-blur-md px-6 py-3 hover:bg-white/20 hover:border-white/60 transition-all"
        type="button"
      >
        <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 fill-white">
          <polygon points="2,1 9,5 2,9" />
        </svg>
        <span className="text-xs md:text-sm tracking-[0.2em] uppercase font-light text-white">Watch the full demo</span>
      </motion.button>
    </div>
  );
}
