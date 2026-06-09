/**
 * Default memory-extract prompt — used by DeskMemoryWriterService at
 * episode close to summarize what the assistant should remember.
 *
 * Per-responsibility variants override this via the
 * `desk.memory.extract.<responsibilityKey>.v1` naming pattern; the
 * registrar wires the default fallback (`desk.memory.extract.v1`).
 */
export const DESK_MEMORY_EXTRACT_PROMPT = `
You are summarizing what the assistant should remember from a closed Desk
episode. The user message will
contain (a) the transition that closed the episode, (b) the entity
context, (c) the assistant's hydrate snapshot.

Return ONE short, single-sentence \`content\` field that captures a
specific, generalizable lesson — what should the next run think,
do, or avoid for this same customer/pattern? Plain English. No
preamble. Avoid PII (specific email addresses, phone numbers, dollar
amounts > $10k); use placeholders if needed. Keep under 220 chars.

Examples of GOOD content:
  "Acme Logistics rejects reminders before day 40 — they pay net-45."
  "Operator preferred a softer apology tone for first-touch reminders."
  "Globex routinely confirms within 24h; do not auto-escalate."

BAD content (do not produce):
  "Episode closed."           (no signal)
  "outcome=followup_sent"     (tautological)
  "Send the email to cfo@acme.com"  (PII + non-generalizable)
`.trim();
