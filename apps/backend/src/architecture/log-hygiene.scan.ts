/**
 * Line-based checks behind `log-hygiene.spec.ts`. Each function takes one file's source with comments stripped
 * (`stripComments` in `source-text.scan.ts`) and returns what it found, with the line number, so a failure names the
 * file and the line. Not a spec itself.
 */

export interface Finding {
  line: number;
  text: string;
}

/** Identifiers that name personal data or a credential (rule 3). Matched against each word of an identifier. */
export const SENSITIVE_WORDS = [
  'phone',
  'email',
  'token',
  'otp',
  'pin',
  'password',
  'secret',
  'url',
  'recipient',
  'html',
  'body',
] as const;

/** Wrapping a value in one of these makes it safe to interpolate. */
export const MASK_HELPERS = ['maskEmail', 'maskPhone', 'stripQueryString', 'scrubContactDetails'] as const;

/** Metric instrument constructors (rule 9). */
export const METRIC_FACTORIES = [
  'createCounter',
  'createHistogram',
  'createGauge',
  'createObservableGauge',
  'getMeter',
];

/** The only instruments that may carry a `tenant` label (rule 9). */
export const TENANT_LABELLED_INSTRUMENTS = ['app_job_failed', 'app_ai_invocation', 'app_ai_invocation_cost_usd'];

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) if (source[i] === '\n') line++;
  return line;
}

function lineText(source: string, line: number): string {
  return (source.split('\n')[line - 1] ?? '').trim();
}

/** Index just past the bracket that closes the one at `open` (`(`, `{` or `[`), skipping string contents. */
function matchBracket(source: string, open: number): number {
  const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
  const stack: string[] = [];
  let i = open;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "'" || ch === '"') {
      i++;
      while (i < source.length && source[i] !== ch) i += source[i] === '\\' ? 2 : 1;
    } else if (ch === '`') {
      i = skipTemplate(source, i);
      continue;
    } else if (pairs[ch]) {
      stack.push(pairs[ch]);
    } else if (ch === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return i + 1;
    }
    i++;
  }
  return source.length;
}

/** Index just past the template literal that starts at `start`. */
function skipTemplate(source: string, start: number): number {
  let i = start + 1;
  while (i < source.length && source[i] !== '`') {
    if (source[i] === '\\') i += 2;
    else if (source[i] === '$' && source[i + 1] === '{') i = matchBracket(source, i + 1);
    else i++;
  }
  return i + 1;
}

/** Every `${…}` expression inside the template literals of `text`. */
export function templateExpressions(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      i++;
      while (i < text.length && text[i] !== ch) i += text[i] === '\\' ? 2 : 1;
      i++;
    } else if (ch === '`') {
      i++;
      while (i < text.length && text[i] !== '`') {
        if (text[i] === '\\') i += 2;
        else if (text[i] === '$' && text[i + 1] === '{') {
          const end = matchBracket(text, i + 1);
          const expr = text.slice(i + 2, end - 1);
          out.push(expr);
          out.push(...templateExpressions(expr));
          i = end;
        } else i++;
      }
      i++;
    } else i++;
  }
  return out;
}

/** Remove every mask-helper call (and its arguments) from an expression. */
function withoutMaskedParts(expr: string): string {
  let out = expr;
  for (;;) {
    const m = new RegExp(`\\b(?:${MASK_HELPERS.join('|')})\\s*\\(`).exec(out);
    if (!m) return out;
    const open = m.index + m[0].length - 1;
    out = out.slice(0, m.index) + out.slice(matchBracket(out, open));
  }
}

/** `resetUrl` → `reset`, `url`; `APP_API_URL` → `app`, `api`, `url`. */
function words(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_$]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

/** Calls that return the same value in another form: `user.email.toLowerCase()` still logs the email. */
const SAME_VALUE_METHODS = new Set(['toLowerCase', 'toUpperCase', 'trim', 'toString', 'normalize']);
/** A name that says the value is already masked. */
const MASKED_PREFIXES = new Set(['masked', 'redacted', 'safe']);
/** Trailing words that do not change what a name holds: `phoneNumber` is a phone, `emailAddress` an email. */
const NEUTRAL_TAILS = new Set(['number', 'address', 'value', 'raw']);

/**
 * Whether a name (the last segment of a member chain) holds sensitive data: its head noun, the last word once
 * neutral tails are dropped, is on the list. `resetUrl`, `mockOtp` and `phoneNumber` are; `emailProvider`,
 * `recipientUserId` and `tokenCount` are not.
 */
export function isSensitiveName(name: string): boolean {
  const parts = words(name);
  if (parts.some((w) => MASKED_PREFIXES.has(w))) return false;
  while (parts.length > 1 && NEUTRAL_TAILS.has(parts[parts.length - 1])) parts.pop();
  return (SENSITIVE_WORDS as readonly string[]).includes(parts[parts.length - 1] ?? '');
}

/**
 * The sensitive values an interpolated expression uses outside a mask helper. A member chain is judged by what it
 * ends in (`user.email` is an email, `decodedToken.uid` is an id), ignoring same-value calls at the end.
 */
export function sensitiveIdentifiers(expr: string): string[] {
  const bare = withoutMaskedParts(expr).replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''");
  const chains = bare.match(/[A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*)*/g) ?? [];
  return chains.filter((chain) => {
    const segments = chain.split(/\s*\??\.\s*/);
    while (segments.length > 1 && SAME_VALUE_METHODS.has(segments[segments.length - 1])) segments.pop();
    return isSensitiveName(segments[segments.length - 1]);
  });
}

const LOGGER_CALL =
  /(?:[\w$]*[lL]ogger\b|new\s+Logger\s*\([^)]*\))\s*\??\.\s*(?:log|warn|error|debug|verbose|fatal)\s*\(/g;

/** Rule 3: logger calls that interpolate a sensitive identifier without a mask helper. */
export function unmaskedLogInterpolations(source: string): Finding[] {
  const findings: Finding[] = [];
  for (const m of source.matchAll(LOGGER_CALL)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const args = source.slice(open, matchBracket(source, open));
    const hits = templateExpressions(args).flatMap(sensitiveIdentifiers);
    if (hits.length > 0) {
      const line = lineOf(source, m.index ?? 0);
      findings.push({ line, text: `${lineText(source, line)}  [${[...new Set(hits)].join(', ')}]` });
    }
  }
  return findings;
}

/** Rule 1: `NODE_ENV` compared with `'production'`, by `===` or `!==`, either way round. */
export function nodeEnvProductionComparisons(source: string): Finding[] {
  const pattern =
    /NODE_ENV['"]?\s*\]?\s*\)?\s*[!=]==?\s*['"`]production['"`]|['"`]production['"`]\s*[!=]==?\s*[\w$.?[\]'"]*NODE_ENV/g;
  return [...source.matchAll(pattern)].map((m) => {
    const line = lineOf(source, m.index ?? 0);
    return { line, text: lineText(source, line) };
  });
}

/** Rule 7: `console.*` calls. */
export function consoleCalls(source: string): Finding[] {
  return [...source.matchAll(/\bconsole\s*\.\s*(?:log|warn|error|info|debug|trace)\s*\(/g)].map((m) => {
    const line = lineOf(source, m.index ?? 0);
    return { line, text: lineText(source, line) };
  });
}

/** Rule 9: calls that create a metric instrument or meter. */
export function metricFactoryCalls(source: string): Finding[] {
  const pattern = new RegExp(`\\.\\s*(?:${METRIC_FACTORIES.join('|')})\\s*\\(`, 'g');
  return [...source.matchAll(pattern)].map((m) => {
    const line = lineOf(source, m.index ?? 0);
    return { line, text: lineText(source, line) };
  });
}

/**
 * Rule 9, inside `metrics.ts`: a `.add(` or `.record(` whose attributes carry a `tenant` key must be on one of the
 * three instruments allowed one. The instrument behind a property is read from `prop: meter.createX('name', …)`.
 */
export function tenantLabelMisuse(source: string): Finding[] {
  const nameOf = new Map<string, string>();
  for (const m of source.matchAll(/(\w+)\s*:\s*[\w$.]*\.\s*create\w+\s*\(\s*['"`]([\w.]+)['"`]/g)) {
    nameOf.set(m[1], m[2]);
  }
  const findings: Finding[] = [];
  for (const m of source.matchAll(/\.\s*(\w+)\s*\.\s*(?:add|record)\s*\(/g)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const args = source.slice(open, matchBracket(source, open));
    if (!/(?:[{,]\s*tenant\s*[,}:])|['"]tenant['"]\s*:/.test(args)) continue;
    const instrument = nameOf.get(m[1]);
    if (instrument && TENANT_LABELLED_INSTRUMENTS.includes(instrument)) continue;
    const line = lineOf(source, m.index ?? 0);
    findings.push({ line, text: `${lineText(source, line)}  [${instrument ?? m[1]}]` });
  }
  return findings;
}

/** Rule 10: imports of the Sentry SDK. */
export function sentryImports(source: string): Finding[] {
  return [...source.matchAll(/(?:\bfrom\s+|\brequire\s*\(\s*|\bimport\s*\(\s*|\bimport\s+)['"]@sentry\//g)].map((m) => {
    const line = lineOf(source, m.index ?? 0);
    return { line, text: lineText(source, line) };
  });
}

/** The module specifier of the first `import` statement in a file. */
export function firstImport(source: string): string | undefined {
  return /^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/m.exec(source)?.[1];
}
