/**
 * @jest-environment jsdom
 */
/* global describe, it, expect */
import { render, screen } from '@testing-library/react';
import { STATUS_TONES, STATUS_TONE_ORDER, StatusBadge, toneBadgeClass, type StatusTone } from '@app/ui';

describe('toneBadgeClass', () => {
  it('has exactly the six tones, each on theme tokens only', () => {
    expect(STATUS_TONE_ORDER).toEqual(['neutral', 'info', 'warning', 'success', 'danger', 'muted']);
    for (const tone of STATUS_TONE_ORDER) {
      const classes = toneBadgeClass(tone);
      expect(classes).toBe(STATUS_TONES[tone]);
      // No raw palette colour (amber-500, emerald-500, blue-500…) may leak in — tokens are dark-safe by construction.
      expect(classes).not.toMatch(/-(?:red|amber|emerald|blue|green|yellow|orange|gray|slate)-\d{2,3}/);
    }
  });

  it('gives every tone a different look', () => {
    const looks = new Set(STATUS_TONE_ORDER.map((tone) => toneBadgeClass(tone)));
    expect(looks.size).toBe(STATUS_TONE_ORDER.length);
  });

  it('gives every tinted tone an AA text token, never the fill hue as text', () => {
    // The fill hues (text-caution, text-success…) measure 1.7–2.8:1 on their own tint in light theme.
    expect(toneBadgeClass('warning')).toMatch(/\btext-caution-text\b/);
    expect(toneBadgeClass('success')).toMatch(/\btext-success-text\b/);
    expect(toneBadgeClass('info')).toMatch(/\btext-info-text\b/);
    expect(toneBadgeClass('danger')).toMatch(/\btext-critical-text\b/);
    for (const tone of STATUS_TONE_ORDER) {
      expect(toneBadgeClass(tone)).not.toMatch(/\btext-(?:caution|success|info|critical)(?:\s|$)/);
    }
  });

  it('keeps a visible border on neutral so the badge shape survives on a card surface', () => {
    expect(toneBadgeClass('neutral')).toMatch(/\bborder-border\b/);
    expect(toneBadgeClass('neutral')).not.toMatch(/border-transparent/);
  });

  it('falls back to neutral for an unknown tone rather than to no colour', () => {
    expect(toneBadgeClass('mystery' as StatusTone)).toBe(STATUS_TONES.neutral);
  });
});

describe('StatusBadge', () => {
  it('wears the tone classes, names the tone, and keeps the label as text', () => {
    render(<StatusBadge tone="warning">Awaiting review</StatusBadge>);
    const badge = screen.getByText('Awaiting review');
    expect(badge.getAttribute('data-tone')).toBe('warning');
    expect(badge.className).toContain('text-caution-text');
    expect(badge.className).toContain('bg-caution/15');
  });
});
