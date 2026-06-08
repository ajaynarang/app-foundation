'use client';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogTitle } from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Play, X } from 'lucide-react';

/**
 * A "Watch Demo" button that opens the product demo video
 * in a dark fullscreen-ish dialog overlay.
 */
export function DemoVideoLightbox() {
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.8 }}
      >
        <Button variant="outline" size="lg" onClick={() => setOpen(true)} className="text-base px-8 py-6 gap-2">
          <Play className="h-4 w-4" />
          Watch Demo
        </Button>
      </motion.div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-5xl w-[95vw] p-0 border-none bg-black overflow-hidden rounded-xl">
          <DialogTitle className="sr-only">SALLY Product Demo</DialogTitle>
          <button
            onClick={() => handleOpenChange(false)}
            className="absolute top-3 right-3 z-50 rounded-full p-2 bg-black/60 hover:bg-black/80 text-white transition-colors"
            aria-label="Close video"
          >
            <X className="h-5 w-5" />
          </button>
          <video ref={videoRef} autoPlay controls playsInline className="w-full aspect-video">
            <source src={`${process.env.NEXT_PUBLIC_CDN_URL}/videos/sally-demo.webm`} type="video/webm" />
            <source src={`${process.env.NEXT_PUBLIC_CDN_URL}/videos/sally-demo.mp4`} type="video/mp4" />
          </video>
        </DialogContent>
      </Dialog>
    </>
  );
}
