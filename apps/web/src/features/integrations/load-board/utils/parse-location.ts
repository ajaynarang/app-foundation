import { US_FREIGHT_CITIES } from '../data/us-freight-cities';

/** Parse "Chicago, IL", "Chicago IL", or just "Chicago" (if it uniquely matches a known freight city) */
export function parseLocation(input: string): { city: string; state: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // "City, ST" format
  const commaMatch = trimmed.match(/^(.+?),\s*([A-Za-z]{2})$/);
  if (commaMatch) return { city: commaMatch[1].trim(), state: commaMatch[2].toUpperCase() };

  // "City ST" format
  const spaceMatch = trimmed.match(/^(.+?)\s+([A-Za-z]{2})$/);
  if (spaceMatch) return { city: spaceMatch[1].trim(), state: spaceMatch[2].toUpperCase() };

  // Single word/phrase — try to match a known freight city (case-insensitive, exact match)
  const lower = trimmed.toLowerCase();
  const exactMatch = US_FREIGHT_CITIES.filter((c) => c.city.toLowerCase() === lower);
  if (exactMatch.length === 1) {
    return { city: exactMatch[0].city, state: exactMatch[0].state };
  }

  return null;
}
