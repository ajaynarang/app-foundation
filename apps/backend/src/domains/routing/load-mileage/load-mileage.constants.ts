/** Debounce window before a recompute job runs — collapses drag-reorder thrash. */
export const LOAD_MILEAGE_RECOMPUTE_DEBOUNCE_MS = 1000;

/** BullMQ retry attempts for a failed recompute. */
export const LOAD_MILEAGE_MAX_ATTEMPTS = 3;

/** Base delay for exponential backoff between retries. */
export const LOAD_MILEAGE_BACKOFF_MS = 5000;

/** Minimum geocoded stops required to compute a route. */
export const LOAD_MILEAGE_MIN_STOPS = 2;
