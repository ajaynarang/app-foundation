import type { LoadStop } from '@/features/fleet/loads/types';

export function formatStopAddress(stop: LoadStop): string {
  return [stop.stopAddress, stop.stopCity, stop.stopState].filter(Boolean).join(', ');
}
