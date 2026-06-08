'use client';

import Image, { type ImageProps } from 'next/image';
import { useTheme } from 'next-themes';

type ThemeAwareImageProps = Omit<ImageProps, 'src'> & {
  /** Path to the dark variant (e.g. '/screenshots/dispatcher/loads.png'). The light variant is
   *  derived by inserting '.light' before '.png' (→ '/screenshots/dispatcher/loads.light.png').
   *  If a `*.light.png` does not exist for a given screenshot, leave the dark `src` to render in
   *  both themes — the image just won't switch. */
  src: string;
};

function deriveLightSrc(darkSrc: string): string {
  if (!darkSrc.endsWith('.png')) return darkSrc;
  return darkSrc.replace(/\.png$/, '.light.png');
}

/**
 * Renders a screenshot whose source swaps based on the resolved theme.
 * Always pass the DARK variant as `src`; the light variant is auto-derived.
 *
 * Defaults to the dark variant during SSR / before hydration so server-rendered HTML matches
 * the dark default theme of the marketing site.
 */
export function ThemeAwareImage({ src, alt, ...props }: ThemeAwareImageProps) {
  const { resolvedTheme } = useTheme();
  const finalSrc = resolvedTheme === 'light' ? deriveLightSrc(src) : src;
  return <Image src={finalSrc} alt={alt} {...props} />;
}
