/**
 * Shared types for platform services.
 *
 * These interfaces are used across multiple provider domains (routing, weather,
 * mileage, traffic, tolls) and are centralised here to avoid duplication.
 */

export interface Waypoint {
  latitude: number;
  longitude: number;
}
