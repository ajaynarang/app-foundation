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

  /** Loads page persisted board mode: 'status' | 'table' (layout) or 'convoy' (legacy persisted value → Trip grouping) */
  LOADS_VIEW_MODE: 'loads-active-view-mode',

  /** Command center card compact/expanded mode */
  COMMAND_CENTER_CARD_MODE: 'command-center-card-mode',

  /** Command center primary view (list | map) */
  COMMAND_CENTER_PRIMARY_VIEW: 'command-center-primary-view',

  /** Command center entity view (load | driver) */
  COMMAND_CENTER_VIEW_MODE: 'command-center-view-mode',

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

  /** Active loads table — visible column keys (JSON array) */
  LOADS_TABLE_COLUMNS: 'app:loads-table-columns',

  /** Display font-size scale percentage (80–120) */
  FONT_SIZE_SCALE: 'app:font-size-scale',

  /** One-time toast announcing ⌘K and g-h shortcuts */
  HOTKEY_INTRO_SHOWN: 'app:hotkey-intro-shown',

  /** Desk External-agents quickstart modal — "don't show again" flag */
  DESK_QUICKSTART_DISMISSED: 'desk-quickstart-dismissed',

  /** Tower v3 lookahead window preference (2 | 4 | 8 | 'shift') */
  TOWER_LOOKAHEAD: 'app:tower:lookahead',

  /** Tower v3 adaptive 2-pane preference at <1100px (JSON: [left, right]) */
  TOWER_PANE_PREFERENCE: 'app:tower:pane-pref',

  /** Tower v3 ≥1100px column layout — spine/wire widths + collapsed state (JSON) */
  TOWER_LAYOUT: 'app:tower:layout',

  /** Tower v3 map radar ledge collapsed state ('1' = collapsed) */
  TOWER_RADAR_COLLAPSED: 'app:tower:radar-collapsed',
} as const;

// ─── sessionStorage ────────────────────────────────────────────────────────────

export const SESSION_KEYS = {
  /** Last delivered load ID (driver flow) */
  LAST_DELIVERED_LOAD: 'lastDeliveredLoad',

  /** Dev tools visible — activated by Ctrl+Shift+> */
  DEV_GHOST_VISIBLE: 'app_dev_ghost_visible',
} as const;
