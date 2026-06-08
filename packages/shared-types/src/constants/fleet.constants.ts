/**
 * Fleet & routing business constants shared across backend and frontend.
 * Single source of truth for values used in routing, invoicing, profitability, and IFTA.
 */

// ─── Geography ─────────────────────────────────────────────────────────────────
export const EARTH_RADIUS_MILES = 3959;

// ─── Fuel defaults (Class 8 trucks) ────────────────────────────────────────────
export const DEFAULT_FUEL_TANK_GALLONS = 300;
export const FUEL_RESERVE_GALLONS = 50;
export const DEFAULT_MPG = 6.5;
export const DEFAULT_FUEL_COST_PER_GALLON = 3.5;
/** Must equal DEFAULT_FUEL_COST_PER_GALLON * 100 */
export const DEFAULT_FUEL_COST_PER_GALLON_CENTS = 350;
export const FUELING_TIME_HOURS = 0.5;

// ─── Speed & ETA ───────────────────────────────────────────────────────────────
export const AVG_TRUCK_SPEED_MPH = 50;
export const PLANNING_TRUCK_SPEED_MPH = 55;

// ─── Dock & operations ─────────────────────────────────────────────────────────
export const DOCK_DEFAULT_HOURS = 2;
export const BREAK_DURATION_HOURS = 0.5;
export const MAX_SIMULATION_SEGMENTS = 200;

// ─── Detention billing ─────────────────────────────────────────────────────────
export const DETENTION_FREE_HOURS = 2;
export const DETENTION_RATE_CENTS = 7500; // $75.00/hr

// ─── IFTA thresholds ───────────────────────────────────────────────────────────
export const NO_FUEL_MILEAGE_THRESHOLD = 500;
export const IFTA_DEADLINE_WARNING_DAYS = 30;
export const IFTA_DEADLINE_CRITICAL_DAYS = 7;

// ─── Lane analysis ─────────────────────────────────────────────────────────────
export const LANE_RATE_LOOKBACK_DAYS = 90;
export const MIN_LOADS_FOR_LANE_INSIGHT = 3;
export const LANE_RATE_ABOVE_THRESHOLD = 0.05;
