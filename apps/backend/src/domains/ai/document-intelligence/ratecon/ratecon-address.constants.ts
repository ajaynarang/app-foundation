/**
 * Rate-confirmation address parsing constants — single source of truth for the
 * patterns used to recover a stop's discrete `city` / `state` / `zip_code` from
 * a combined single-line location string.
 *
 * WHY THIS EXISTS (SQ-112): some broker ratecons (e.g. Prosponsive Logistics)
 * print each stop location as ONE line with no street address —
 * `Fair Lawn, NJ US 07410`. The extraction prompt is deliberately conservative
 * (SQ-107: "never infer, leave empty if unclear"), so the model leaves
 * `city`/`state` blank rather than splitting that line. The resulting draft
 * trips the DRAFT→PENDING validator ("Stop N is missing city/state").
 *
 * These patterns let us deterministically split a "City, ST [US] ZIP" string
 * that is ALREADY PRESENT in the document — this is parsing present data, not
 * inferring absent data, so it does not re-introduce the SQ-107 hallucination
 * risk. The normalizer that uses them is backfill-only: it never overwrites a
 * value the model already extracted.
 *
 * Keep every address regex HERE. Do not inline location regexes in services.
 */

/**
 * US state / territory two-letter codes. The bare `[A-Z]{2}` class would match
 * non-states ("US", "PO", "MA" is fine but "XX" is not), so we validate against
 * the real set to avoid mis-splitting a string like `Acme, IN HOUSE 07410`.
 */
export const US_STATE_CODES: ReadonlySet<string> = new Set([
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  // Federal district + inhabited territories that appear on real ratecons.
  'DC',
  'PR',
  'VI',
  'GU',
  'AS',
  'MP',
]);

/**
 * Matches a combined "City, ST [US|USA] ZIP[-ZIP4]" location line where the
 * city, two-letter state, optional country token, and 5-digit (optionally +4)
 * ZIP are the WHOLE trimmed string — i.e. no street address prefix.
 *
 * Capture groups:
 *   1. city  — letters plus spaces / `.` / `'` / `-` (covers "St. Louis",
 *              "Winston-Salem", "O'Fallon"). Must start with a letter.
 *   2. state — exactly two uppercase letters (validated against US_STATE_CODES
 *              by the caller; the class alone is intentionally loose).
 *   3. zip   — 5 digits, optional `-NNNN` ZIP+4.
 *
 * Bounded with anchors + a single comma so a full street line
 * ("76 Main St, Fair Lawn, NJ US 07410") does NOT match this pattern — that
 * variant is handled by CITY_STATE_ZIP_WITH_STREET_PATTERN instead.
 */
export const CITY_STATE_ZIP_ONLY_PATTERN =
  /^([A-Za-z][A-Za-z .'-]*?),\s*([A-Za-z]{2})\s+(?:USA?\s+)?(\d{5}(?:-\d{4})?)$/;

/**
 * Matches a fuller "Street, City, ST [US|USA] ZIP" line, capturing the trailing
 * city/state/zip while ignoring the leading street portion. Used only to
 * backfill empty city/state when the model dropped them into a combined
 * `address`/`facility_name` field but left the discrete fields blank.
 *
 * Capture groups: 1. city · 2. state · 3. zip (same shapes as above).
 * The street portion is matched non-greedily and discarded.
 */
export const CITY_STATE_ZIP_WITH_STREET_PATTERN =
  /(?:^|,)\s*([A-Za-z][A-Za-z .'-]*?),\s*([A-Za-z]{2})\s+(?:USA?\s+)?(\d{5}(?:-\d{4})?)\s*$/;
