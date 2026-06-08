'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import { Play } from 'lucide-react';

const easeOut = [0.21, 0.47, 0.32, 0.98] as [number, number, number, number];

export function DemoVideoSection() {
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  // Auto-play muted when scrolled into view
  useEffect(() => {
    if (isInView && videoRef.current && !isPlaying) {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  }, [isInView, isPlaying]);

  const _toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handlePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {});
      }
      videoRef.current.muted = false;
      setIsMuted(false);
    }
  };

  return (
    <section id="demo" ref={ref} className="px-4 md:px-6 lg:px-8 py-16 md:py-24 max-w-6xl mx-auto scroll-mt-8">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, ease: easeOut }}
        className="text-center mb-10"
      >
        <h2 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">See SALLY in action</h2>
        <p className="mt-3 text-muted-foreground">From command center to close-out — watch the full workflow.</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.8, delay: 0.2, ease: easeOut }}
      >
        {/* Browser chrome frame */}
        <div className="rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
          {/* Title bar */}
          <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/20 dark:bg-red-500/30" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/20 dark:bg-yellow-500/30" />
              <div className="w-3 h-3 rounded-full bg-green-500/20 dark:bg-green-500/30" />
            </div>
            <div className="flex-1 mx-8">
              <div className="h-6 rounded-md bg-muted/80 dark:bg-muted max-w-xs mx-auto flex items-center justify-center">
                <span className="text-2xs text-muted-foreground/60 font-mono">sally.appshore.in</span>
              </div>
            </div>
            <div className="w-12" />
          </div>

          {/* Video container */}
          <div
            className="relative group cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label="Play demo video"
            onClick={handlePlay}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handlePlay();
              }
            }}
          >
            <video ref={videoRef} muted playsInline loop controls={isPlaying} className="w-full aspect-video bg-black">
              <source src={`${process.env.NEXT_PUBLIC_CDN_URL}/videos/sally-demo.webm`} type="video/webm" />
              <source src={`${process.env.NEXT_PUBLIC_CDN_URL}/videos/sally-demo.mp4`} type="video/mp4" />
            </video>

            {/* Play overlay (shown when not playing) */}
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
                  <Play className="h-7 w-7 text-white ml-1" />
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
