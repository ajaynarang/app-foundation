/**
 * SQ-119 — scrambled-layout detector for the text-first ratecon path.
 *
 * Some broker forms (the "FROM / CARRIER" vertical-label templates from JY
 * Carriers, American Logistics, Freight Tec, Value Industry, …) place the load
 * number's *value* in the header and its *label* in a detached box or a
 * vertically-stacked column. When `pdf-parse` linearizes that layout, the label
 * and value land in completely different regions of the text stream:
 *
 *     62988                       ← PRO# value (top, bare, no label)
 *     252 DOREMUS AVE 1581811     ← MC# value glued to an address line
 *     ...
 *     PRO #  Rate Confirmation    ← "PRO #" label stranded near the footer
 *     MC #                        ← "MC #" label, also detached
 *
 * With the binding destroyed, the extractor can no longer tell which number the
 * "PRO #" label refers to and grabs the carrier's MC# (1581811) instead of the
 * real load number (62988). The disambiguation prompt cannot fire — it relies on
 * the label sitting next to its value, which is exactly what was lost.
 *
 * The fix is to detect this *before* sending text to the model and escalate to
 * the vision strategy, where the spatial layout (and thus the label↔value
 * binding) is preserved.
 *
 * Detection signal — validated against 26 real ratecons + the SQ-119/106 PDFs:
 *   A load-number label is present in the text, but NO occurrence of it has a
 *   digit run adjacent. A healthy text layer renders "Load # 8481647" (bound);
 *   a scrambled one renders a lone "PRO #" with its value elsewhere (orphaned).
 *
 * This is deliberately narrow: it fires only when a load-number label exists AND
 * every instance is orphaned. Forms whose load label is bound to its value stay
 * on the cheaper text-first path, and forms with no `#`-style load label at all
 * are left untouched (they extract correctly today).
 */

/** Load-number labels — broker/shipment vocabulary that introduces the load number. */
const LOAD_NUMBER_LABEL = /\b(?:PRO|Load|Order|Shipment|Reference|Confirmation|Trip)\s*#/gi;

/**
 * Characters after a label to scan for its value. One header field ("PRO #
 * 62988") fits comfortably; large enough to tolerate a stray separator, small
 * enough not to reach across into an unrelated column.
 */
const VALUE_LOOKAHEAD_CHARS = 25;

/** A value-like token: a run of 3+ digits (load numbers are never 1–2 digits). */
const VALUE_DIGIT_RUN = /\d{3,}/;

export interface LayoutScrambleResult {
  /** True when a load-number label exists but every occurrence is orphaned from its value. */
  isScrambled: boolean;
  /** Total load-number label occurrences found. */
  loadLabelCount: number;
  /** How many of those occurrences had a value adjacent. */
  boundLabelCount: number;
}

/**
 * Does a value (digit run) sit immediately after the label, on the SAME line?
 *
 * The window is clipped at the first newline so a label only counts as "bound"
 * when its value is genuinely inline ("PRO # 62988"). Without the clip, an
 * orphaned label sitting directly above a numeric address/MC# row
 * ("PRO #\n252 DOREMUS AVE 1581811") would falsely read as bound — masking the
 * very scrambled layout this detector exists to catch.
 */
function hasAdjacentValue(text: string, labelEndIndex: number): boolean {
  const sameLineWindow = text.slice(labelEndIndex, labelEndIndex + VALUE_LOOKAHEAD_CHARS).split('\n')[0];
  return VALUE_DIGIT_RUN.test(sameLineWindow);
}

/**
 * Detect a scrambled text layer where load-number labels have been severed from
 * their values. Operates on the same `pdf-parse` text the model would receive,
 * so the decision costs zero model calls.
 */
export function detectScrambledLayout(pdfText: string): LayoutScrambleResult {
  let loadLabelCount = 0;
  let boundLabelCount = 0;

  // Fresh RegExp instance per call — the module-level literal carries `g` state.
  const labelRe = new RegExp(LOAD_NUMBER_LABEL.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = labelRe.exec(pdfText)) !== null) {
    loadLabelCount++;
    if (hasAdjacentValue(pdfText, match.index + match[0].length)) {
      boundLabelCount++;
    }
  }

  // Scrambled iff a load label exists AND not one occurrence is bound to a value.
  const isScrambled = loadLabelCount > 0 && boundLabelCount === 0;
  return { isScrambled, loadLabelCount, boundLabelCount };
}
