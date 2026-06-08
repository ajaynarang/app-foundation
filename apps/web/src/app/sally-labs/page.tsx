'use client';

import { useState } from 'react';
import { HeroSignalTrace } from '@/shared/components/common/landing/sally-labs/HeroSignalTrace';
import { HeroPulseMap } from '@/shared/components/common/landing/sally-labs/HeroPulseMap';
import { HeroWebGLFleet } from '@/shared/components/common/landing/sally-labs/HeroWebGLFleet';
import { HeroGradientMesh } from '@/shared/components/common/landing/sally-labs/HeroGradientMesh';
import { HeroVideoLoop } from '@/shared/components/common/landing/sally-labs/HeroVideoLoop';
import { HeroPhotograph } from '@/shared/components/common/landing/sally-labs/HeroPhotograph';

/**
 * /sally-labs — internal preview route for comparing hero variants.
 * Delete this route + losing variants once a direction is picked.
 */
export default function SallyLabsPage() {
  const [showGrid, setShowGrid] = useState(false);

  const variants = [
    {
      id: 'C',
      name: 'Signal-traced SALLY',
      tag: 'Telemetry pings + wipe-fill letters. Data-native.',
      Component: HeroSignalTrace,
    },
    {
      id: 'D',
      name: 'Pulse Map',
      tag: 'US outline + chain-reaction signals from Memphis.',
      Component: HeroPulseMap,
    },
    {
      id: 'F',
      name: 'WebGL Fleet (live GPU)',
      tag: '3000 particles orbiting in 3D space. Mouse parallax. Never the same twice.',
      Component: HeroWebGLFleet,
    },
    {
      id: 'G',
      name: 'Generative Gradient Mesh',
      tag: 'Animated shader mesh. Gemini / Apple Intelligence aesthetic.',
      Component: HeroGradientMesh,
    },
    {
      id: 'H',
      name: 'Cinematic Video Loop',
      tag: 'SALLY launch video as background. Apple product-page move.',
      Component: HeroVideoLoop,
    },
    {
      id: 'I',
      name: 'Hero Photograph',
      tag: 'Monochrome-graded freight photo. Switch between 3 shots.',
      Component: HeroPhotograph,
    },
  ];

  return (
    <main className="min-h-screen bg-background">
      {/* Fixed control bar — grid toggle */}
      <div className="fixed top-4 right-4 z-[100] flex items-center gap-3 rounded-full border border-border bg-background/90 backdrop-blur-md px-4 py-2 shadow-sm">
        <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">grid bg</span>
        <button
          type="button"
          onClick={() => setShowGrid((v) => !v)}
          role="switch"
          aria-checked={showGrid}
          className={`relative h-5 w-9 rounded-full transition-colors ${showGrid ? 'bg-foreground' : 'bg-muted'}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform ${
              showGrid ? 'translate-x-[18px]' : 'translate-x-0.5'
            }`}
          />
        </button>
        <span className="text-xs font-medium text-foreground tabular-nums">{showGrid ? 'ON' : 'OFF'}</span>
      </div>

      {variants.map(({ id, name, tag, Component }) => (
        <section key={id} className="relative border-b border-border">
          {/* Section label */}
          <div className="absolute top-6 left-6 z-50 inline-flex items-center gap-3 rounded-full border border-border bg-background/80 backdrop-blur px-4 py-1.5">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">variant {id}</span>
            <span className="text-xs font-medium text-foreground">{name}</span>
            <span className="hidden md:inline text-xs text-muted-foreground">— {tag}</span>
          </div>

          {/* Grid overlay — visible on every variant when toggled on */}
          {showGrid && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[5]"
              style={{
                backgroundImage:
                  'linear-gradient(to right, hsl(var(--foreground) / 0.08) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground) / 0.08) 1px, transparent 1px)',
                backgroundSize: '48px 48px',
                maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 90%)',
                WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 90%)',
              }}
            />
          )}

          <Component />
        </section>
      ))}
    </main>
  );
}
