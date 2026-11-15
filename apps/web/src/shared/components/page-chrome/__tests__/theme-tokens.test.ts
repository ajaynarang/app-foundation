/* global describe, it, expect */
import { readFileSync } from 'fs';
import { join } from 'path';
import uiPreset from '@app/ui/tailwind-preset';

/**
 * The text tokens the page chrome and the status tones wear, measured against the surfaces they sit on.
 * A product that sets its own `--brand` / `--brand-text` (packages/ui/src/styles/globals.css) keeps this green.
 */
const GLOBALS_CSS = readFileSync(join(__dirname, '../../../../../../../packages/ui/src/styles/globals.css'), 'utf8');

type Hsl = [number, number, number];
type Rgb = [number, number, number];

function themeTokens(selector: ':root' | '.dark'): Record<string, Hsl> {
  const start = GLOBALS_CSS.indexOf(`${selector} {`);
  const block = GLOBALS_CSS.slice(start, GLOBALS_CSS.indexOf('\n}', start));
  const tokens: Record<string, Hsl> = {};
  for (const match of block.matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%;/g)) {
    tokens[match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])];
  }
  return tokens;
}

function hslToRgb([h, s, l]: Hsl): Rgb {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

function blend(top: Rgb, bottom: Rgb, alpha: number): Rgb {
  return top.map((channel, i) => channel * alpha + bottom[i] * (1 - alpha)) as Rgb;
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each([':root', '.dark'] as const)('theme %s: text tokens clear WCAG AA', (selector) => {
  const tokens = themeTokens(selector);
  const color = (name: string) => {
    expect({ token: name, defined: tokens[name] !== undefined }).toEqual({ token: name, defined: true });
    return hslToRgb(tokens[name]);
  };
  const surfaces = () => ({ background: color('background'), card: color('card'), muted: color('muted') });
  const AA = 4.5;
  /** WCAG 1.4.11: a non-text mark (the focused-row marker) needs 3:1 against what it sits on. */
  const NON_TEXT = 3;

  it('identifiers (brand-text) on every row surface: background, card, muted', () => {
    for (const [name, surface] of Object.entries(surfaces())) {
      expect({ surface: name, ratio: contrast(color('brand-text'), surface) >= AA }).toEqual({
        surface: name,
        ratio: true,
      });
    }
  });

  it('the focused-row marker (brand fill) reads as a mark on card and background', () => {
    for (const surface of [color('card'), color('background')]) {
      expect(contrast(color('brand'), blend(color('muted'), surface, 0.4))).toBeGreaterThanOrEqual(NON_TEXT);
    }
  });

  it.each([
    ['info-text', 'info'],
    ['caution-text', 'caution'],
    ['success-text', 'success'],
    ['critical-text', 'critical'],
  ])('%s on its 15%% %s tint, over card and background', (text, fill) => {
    for (const surface of [color('card'), color('background')]) {
      expect(contrast(color(text), blend(color(fill), surface, 0.15))).toBeGreaterThanOrEqual(AA);
    }
  });

  it('critical-text on card / background and on its 10% hover tint (the lone destructive row action)', () => {
    for (const surface of [color('card'), color('background')]) {
      expect(contrast(color('critical-text'), surface)).toBeGreaterThanOrEqual(AA);
      expect(contrast(color('critical-text'), blend(color('critical'), surface, 0.1))).toBeGreaterThanOrEqual(AA);
    }
  });

  it('the focused-row tint (muted/40): identifiers and muted bylines clear AA on it', () => {
    for (const surface of [color('card'), color('background')]) {
      const tint = blend(color('muted'), surface, 0.4);
      expect(contrast(color('brand-text'), tint)).toBeGreaterThanOrEqual(AA);
      expect(contrast(color('muted-foreground'), tint)).toBeGreaterThanOrEqual(AA);
    }
  });
});

describe('tailwind preset: the tokens are reachable as classes', () => {
  const colors = (uiPreset.theme?.extend?.colors ?? {}) as Record<string, Record<string, string>>;

  it.each(['info', 'caution', 'success', 'critical'])('text-%s-text', (name) => {
    expect(colors[name]?.text).toBe(`hsl(var(--${name}-text))`);
  });

  it('bg-brand and text-brand-text', () => {
    expect(colors.brand?.DEFAULT).toBe('hsl(var(--brand))');
    expect(colors.brand?.text).toBe('hsl(var(--brand-text))');
  });
});
