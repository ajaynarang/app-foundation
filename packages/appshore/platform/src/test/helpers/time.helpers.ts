/**
 * Time helper utilities for tests.
 * Provides convenient functions for creating dates and durations.
 */

export const hoursMs = (h: number) => h * 3_600_000;
export const minutesMs = (m: number) => m * 60_000;
export const daysMs = (d: number) => d * 86_400_000;

export const hoursAgo = (h: number) => new Date(Date.now() - hoursMs(h));
export const minutesAgo = (m: number) => new Date(Date.now() - minutesMs(m));
export const daysAgo = (d: number) => new Date(Date.now() - daysMs(d));

export const hoursFromNow = (h: number) => new Date(Date.now() + hoursMs(h));
export const daysFromNow = (d: number) => new Date(Date.now() + daysMs(d));

export const dateOnly = (date: Date) => date.toISOString().split('T')[0];

export const farFuture = () => daysFromNow(90);
export const recent = () => daysAgo(7);
