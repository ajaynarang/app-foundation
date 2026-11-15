// A small, deterministic YAML emitter for the generated provisioning files: plain objects, arrays, strings, numbers,
// booleans and null. It exists so the scripts run on plain Node with no installed package, which is what lets
// `pnpm init-app` regenerate the catalog on a fresh clone before `pnpm install`.
//
// Output rules, chosen so nothing is ever read back as another type or another string:
//   - a string is plain only when it is a word-like run with single spaces and is not a YAML keyword;
//     anything else is double-quoted with JSON escapes (a valid YAML double-quoted scalar);
//   - a multi-line string is a literal block (`|`, `|-` or `|+` to keep its trailing newlines exactly);
//   - empty objects and arrays are `{}` and `[]`.

const PLAIN = /^[A-Za-z_][A-Za-z0-9_./-]*(?: [A-Za-z0-9_./()-]+)*$/;
const KEYWORDS = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', 'y', 'n', '~']);
const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function scalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`yaml-emit: cannot write ${value}`);
    return String(value);
  }
  if (typeof value === 'string') {
    if (PLAIN.test(value) && !KEYWORDS.has(value.toLowerCase())) return value;
    return JSON.stringify(value);
  }
  throw new Error(`yaml-emit: unsupported value of type ${typeof value}`);
}

const key = (k) => (PLAIN_KEY.test(k) && !KEYWORDS.has(k.toLowerCase()) ? k : JSON.stringify(k));

/** A literal block for a multi-line string, or null when the string must be quoted instead. */
function block(value, indent) {
  if (!value.includes('\n') || /^[ \t]/.test(value) || /[\r\t]/.test(value)) return null;
  const trailing = value.match(/\n*$/)[0].length;
  const chomp = trailing === 0 ? '-' : trailing === 1 ? '' : '+';
  const body = trailing > 0 ? value.slice(0, -1) : value;
  const pad = ' '.repeat(indent);
  return `|${chomp}\n${body
    .split('\n')
    .map((line) => (line ? pad + line : ''))
    .join('\n')}`;
}

function inline(value, indent) {
  if (typeof value === 'string') return block(value, indent) ?? scalar(value);
  return scalar(value);
}

function emit(value, indent) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return value
      .map((item) => {
        if ((isObject(item) && Object.keys(item).length > 0) || (Array.isArray(item) && item.length > 0)) {
          // The first line of the nested block goes on the dash line.
          return `${pad}- ${emit(item, indent + 2).slice(indent + 2)}`;
        }
        if (isObject(item)) return `${pad}- {}`;
        if (Array.isArray(item)) return `${pad}- []`;
        return `${pad}- ${inline(item, indent + 2)}`;
      })
      .join('\n');
  }
  if (isObject(value)) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return `${pad}{}`;
    return entries
      .map(([k, v]) => {
        if (isObject(v) && Object.keys(v).length > 0) return `${pad}${key(k)}:\n${emit(v, indent + 2)}`;
        if (Array.isArray(v) && v.length > 0) return `${pad}${key(k)}:\n${emit(v, indent + 2)}`;
        if (isObject(v)) return `${pad}${key(k)}: {}`;
        if (Array.isArray(v)) return `${pad}${key(k)}: []`;
        return `${pad}${key(k)}: ${inline(v, indent + 2)}`;
      })
      .join('\n');
  }
  return `${pad}${inline(value, indent)}`;
}

/** The YAML text of `doc`, ending in one newline. */
export function toYaml(doc) {
  return `${emit(doc, 0)}\n`;
}
