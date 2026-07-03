/**
 * Browser storage keys — single source of truth.
 * Prevents typo-related silent bugs and makes it easy to audit what we persist.
 */

// ─── localStorage ──────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  /** Zustand auth persistence (firebase token + user) */
  AUTH_STORAGE: 'auth-storage',

  /** Assistant AI chat layout preference (side | bottom | floating) */
  APP_CHAT_LAYOUT: 'app-chat-layout',

  /** Assistant AI side panel width in pixels */
  APP_SIDE_WIDTH: 'app-side-width',

  /** Prospect (unauthenticated) Assistant AI session token */
  APP_PROSPECT_TOKEN: 'app-prospect-session-token',

  /** Active theme (light | dark) */
  THEME: 'theme',

  /** Onboarding banner dismissed flag */
  ONBOARDING_BANNER_DISMISSED: 'onboarding-banner-dismissed',

  /** Cookie consent preferences */
  COOKIE_CONSENT: 'app-cookie-consent',

  /** Command palette recent commands (suffixed with role).
   *  v2: prior versions collapsed all app-route visits into Home. */
  CMD_PALETTE_RECENTS_PREFIX: 'app:cmd-palette:recents:v2',
  cmdPaletteRecents: (role: string) => `app:cmd-palette:recents:v2:${role.toLowerCase()}` as const,

  /** Sheet pinned state */
  SHEET_PINNED: 'sheet-pinned-default',

  /** Sheet resize width */
  SHEET_RESIZE_WIDTH: 'sheet-resize-width',

  /** Per-entity-type sheet sizing preference (side-panel/half/full) */
  SHEET_SIZES: 'app:sheet-sizes',

  /** Display font-size scale percentage (80–120) */
  FONT_SIZE_SCALE: 'app:font-size-scale',

  /** One-time toast announcing ⌘K and g-h shortcuts */
  HOTKEY_INTRO_SHOWN: 'app:hotkey-intro-shown',

  /** Desk External-agents quickstart modal — "don't show again" flag */
  DESK_QUICKSTART_DISMISSED: 'desk-quickstart-dismissed',
} as const;

// ─── sessionStorage ────────────────────────────────────────────────────────────

export const SESSION_KEYS = {
  /** Dev tools visible — activated by Ctrl+Shift+> */
  DEV_GHOST_VISIBLE: 'app_dev_ghost_visible',
} as const;
