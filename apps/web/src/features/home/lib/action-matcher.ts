/**
 * Action matcher — maps keyword patterns to quick actions via regex.
 * This is a pure client-side router: NO LLM, instant matching.
 *
 * Priority: exact keyword match > partial match. First match wins.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuickAction {
  id: string;
  label: string;
  /** Target route. null means "no navigation" (handled by caller). */
  href: string | null;
}

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

interface ActionPattern {
  /** Regex to match against normalized (lowercased, trimmed) input */
  pattern: RegExp;
  /** Factory returning the QuickAction when matched */
  action: () => QuickAction;
}

const ACTION_PATTERNS: ActionPattern[] = [
  // Create / new / add load
  {
    pattern: /\b(?:create|new|add)\s+(?:a\s+)?load\b/i,
    action: () => ({
      id: 'action:create-load',
      label: 'Create a new load',
      href: '/dispatcher/loads?action=create',
    }),
  },
  // Upload / import rate con → opens the import dialog on loads page
  {
    pattern: /\b(?:upload|import)\s+(?:a\s+)?(?:rate\s*con(?:firmation)?|ratecon)\b/i,
    action: () => ({
      id: 'action:upload-ratecon',
      label: 'Upload a rate confirmation',
      href: '/dispatcher/loads?action=import-ratecon',
    }),
  },
  // Show / view / open alerts
  {
    pattern: /\b(?:show|view|open|go\s+to)\s+(?:my\s+)?alerts?\b/i,
    action: () => ({
      id: 'action:show-alerts',
      label: 'Open Alerts',
      href: '/dispatcher/alerts',
    }),
  },
  // Show / view / open loads
  {
    pattern: /\b(?:show|view|open|go\s+to)\s+(?:my\s+|all\s+)?loads?\b/i,
    action: () => ({
      id: 'action:show-loads',
      label: 'Open Loads',
      href: '/dispatcher/loads',
    }),
  },
  // Show / view / open fleet
  {
    pattern: /\b(?:show|view|open|go\s+to)\s+(?:my\s+|the\s+)?fleet\b/i,
    action: () => ({
      id: 'action:show-fleet',
      label: 'Open Fleet',
      href: '/dispatcher/fleet',
    }),
  },
  // Show / view / open billing / invoices
  {
    pattern: /\b(?:show|view|open|go\s+to)\s+(?:my\s+|all\s+)?(?:billing|invoices?)\b/i,
    action: () => ({
      id: 'action:show-billing',
      label: 'Open Billing',
      href: '/dispatcher/billing',
    }),
  },
  // Show / view / open settlements / pay
  {
    pattern: /\b(?:show|view|open|go\s+to)\s+(?:my\s+|all\s+)?(?:settlements?|pay)\b/i,
    action: () => ({
      id: 'action:show-pay',
      label: 'Open Settlements',
      href: '/dispatcher/pay',
    }),
  },
  // Show / view / open shield
  {
    pattern: /\b(?:show|view|open|go\s+to)\s+(?:the\s+)?shield\b/i,
    action: () => ({
      id: 'action:show-shield',
      label: 'Open Shield',
      href: '/dispatcher/shield',
    }),
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Match user input against known action patterns.
 * Returns the first matching QuickAction, or null if no match.
 *
 * This is intentionally NOT fuzzy — it uses explicit regex patterns
 * so we only navigate when we're confident about user intent.
 */
export function matchAction(input: string): QuickAction | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;

  for (const { pattern, action } of ACTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return action();
    }
  }

  return null;
}
