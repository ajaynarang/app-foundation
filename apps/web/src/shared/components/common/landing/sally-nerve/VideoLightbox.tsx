'use client';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogTitle } from '@sally/ui/components/ui/dialog';
import { X, ArrowRight } from 'lucide-react';
import Link from 'next/link';

function TruckMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* trailer */}
      <rect x="1" y="4" width="34" height="16" rx="1" />
      {/* trailer detail lines */}
      <line x1="9" y1="4" x2="9" y2="20" opacity="0.4" />
      <line x1="18" y1="4" x2="18" y2="20" opacity="0.4" />
      <line x1="27" y1="4" x2="27" y2="20" opacity="0.4" />
      {/* cab body */}
      <path d="M36 20 V10 a2 2 0 0 1 2 -2 h7 l6 6 v6 z" />
      {/* cab window */}
      <path d="M39 11 h5 l4 4 h-9 z" opacity="0.5" />
      {/* chassis */}
      <line x1="35" y1="20" x2="56" y2="20" />
      {/* wheels */}
      <circle cx="10" cy="22" r="3" fill="currentColor" />
      <circle cx="26" cy="22" r="3" fill="currentColor" />
      <circle cx="48" cy="22" r="3" fill="currentColor" />
      <circle cx="10" cy="22" r="1" className="fill-background" stroke="none" />
      <circle cx="26" cy="22" r="1" className="fill-background" stroke="none" />
      <circle cx="48" cy="22" r="1" className="fill-background" stroke="none" />
      {/* headlight */}
      <circle cx="53" cy="13" r="0.8" fill="currentColor" />
    </svg>
  );
}

/**
 * A "Watch in 60s" button that opens the SALLY launch video
 * in a dark fullscreen-ish dialog overlay.
 * Works in both light and dark themes.
 */
export function VideoLightbox() {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <>
      <div className="flex flex-col items-center gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group relative inline-flex items-center gap-5 rounded-full border border-border/70 bg-background/40 backdrop-blur-sm pl-3 pr-7 py-3 transition-all duration-300 hover:border-foreground/60 hover:shadow-[0_10px_40px_-12px_rgba(0,0,0,0.25)] dark:hover:shadow-[0_10px_40px_-12px_rgba(255,255,255,0.15)] hover:-translate-y-0.5"
            aria-label="Watch SALLY in 60 seconds"
          >
            {/* Truck — floats on its own, no capsule and no road line */}
            <span className="flex h-11 w-[88px] items-center justify-center">
              <TruckMark className="h-7 w-auto text-foreground" />
            </span>

            <span className="flex flex-col items-start leading-none">
              <span className="text-[10px] tracking-[0.32em] uppercase text-muted-foreground">60-second tour</span>
              <span className="mt-1.5 text-sm md:text-base tracking-tight font-medium text-foreground">
                Watch SALLY take the wheel
              </span>
            </span>

            <span
              aria-hidden
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-full border border-border/70 text-foreground transition-all duration-300 group-hover:bg-foreground group-hover:text-background group-hover:border-foreground"
            >
              <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 fill-current">
                <polygon points="2,1 9,5 2,9" />
              </svg>
            </span>
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <Link
            href="/product#demo"
            className="inline-flex items-center gap-1.5 text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors tracking-wide"
          >
            Or watch the full demo
            <ArrowRight className="h-3 w-3" />
          </Link>
        </motion.div>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-5xl w-[95vw] p-0 border-none bg-black overflow-hidden rounded-xl">
          <DialogTitle className="sr-only">SALLY Launch Video</DialogTitle>
          {/* Close button */}
          <button
            onClick={() => handleOpenChange(false)}
            className="absolute top-3 right-3 z-50 rounded-full p-2 bg-black/60 hover:bg-black/80 text-white transition-colors"
            aria-label="Close video"
          >
            <X className="h-5 w-5" />
          </button>
          {/* Video player */}
          <video ref={videoRef} autoPlay controls playsInline className="w-full aspect-video">
            <source src={`${process.env.NEXT_PUBLIC_CDN_URL}/videos/sally-launch.webm`} type="video/webm" />
            <source src={`${process.env.NEXT_PUBLIC_CDN_URL}/videos/sally-launch.mp4`} type="video/mp4" />
          </video>
        </DialogContent>
      </Dialog>
    </>
  );
}
