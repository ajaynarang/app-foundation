/**
 * The IANA zone the platform schedules and formats wall-clock times in. An app
 * binds its own (TournaX: Asia/Kolkata) in its hooks module; unbound means UTC.
 * A token rather than an env read: nothing here can run before configuration exists.
 */
export const PLATFORM_TIMEZONE = 'APPSHORE_PLATFORM_TIMEZONE';
export const DEFAULT_PLATFORM_TIMEZONE = 'UTC';
