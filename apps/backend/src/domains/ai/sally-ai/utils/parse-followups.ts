/**
 * Extract the last <followups> block from assistant text.
 * Returns the cleaned text (without the block) and an array of follow-up strings.
 *
 * Resilient to trailing whitespace/text after the closing tag (LLMs are unreliable
 * at placing the block at the exact end). Filters out very short or very long lines.
 */
export function parseFollowups(text: string): {
  cleanText: string;
  followUps: string[];
} {
  // Non-anchored: find the last <followups> block, tolerating trailing content
  const regex = /<followups>\s*([\s\S]*?)\s*<\/followups>/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    return { cleanText: text, followUps: [] };
  }

  // Remove the matched block and any surrounding whitespace
  const cleanText = (text.slice(0, lastMatch.index) + text.slice(lastMatch.index + lastMatch[0].length)).trimEnd();

  const followUps = lastMatch[1]
    .split('\n')
    .map((line) => line.trim())
    // Strip <followup>...</followup> tags if present
    .map((line) =>
      line
        .replace(/^<followup>\s*/i, '')
        .replace(/\s*<\/followup>\s*$/i, '')
        .trim(),
    )
    .filter((line) => line.length >= 5 && line.length <= 100);

  return { cleanText, followUps };
}
