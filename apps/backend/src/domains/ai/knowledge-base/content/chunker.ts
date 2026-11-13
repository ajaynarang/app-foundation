/**
 * Markdown-aware chunker for the product knowledge base.
 *
 * Splits a document into heading sections first (## / ###), so a chunk never
 * straddles two topics, then packs each section's paragraphs (and, for an
 * oversized paragraph, its sentences) into chunks of at most `maxChars`.
 *
 * Bump CHUNKER_VERSION whenever the output for the same input changes — it is
 * part of each document's content hash, so a bump re-embeds the whole corpus
 * on the next ingest.
 */
export const CHUNKER_VERSION = 3;

export interface ChunkOptions {
  /**
   * Target size for a chunk's body, in characters (~4 chars per token). Only a
   * merged short tail can exceed it, by at most minChars.
   */
  maxChars: number;
  /** Characters of the previous chunk carried into the next one within a section. */
  overlapChars: number;
  /** A trailing piece shorter than this is merged into the chunk before it. */
  minChars: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  maxChars: 1200,
  overlapChars: 150,
  minChars: 200,
};

export interface MarkdownChunk {
  /** Heading path, e.g. "Pricing › Annual plans". Null for text before the first heading. */
  section: string | null;
  text: string;
}

interface Section {
  heading: string | null;
  body: string;
}

const HEADING_RE = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;
/** Matches the knowledge_documents.section column. */
const MAX_SECTION_LENGTH = 255;

function splitSections(markdown: string): Section[] {
  const sections: Section[] = [];
  let h2: string | null = null;
  let current: Section = { heading: null, body: '' };
  // The marker that opened the current fence; only the same marker closes it.
  let openFence: string | null = null;

  for (const line of markdown.split('\n')) {
    const fence = FENCE_RE.exec(line);
    if (fence && openFence === null) openFence = fence[1];
    else if (fence && fence[1] === openFence) openFence = null;

    const match = openFence || fence ? null : HEADING_RE.exec(line);
    if (!match) {
      current.body += `${line}\n`;
      continue;
    }

    sections.push(current);
    const level = match[1].length;
    const text = match[2].trim();
    // A single # is the document title; it carries no section context of its own.
    if (level <= 2) h2 = level === 2 ? text : null;
    const heading = level === 3 && h2 ? `${h2} › ${text}` : text;
    current = { heading: level === 1 ? null : heading.slice(0, MAX_SECTION_LENGTH), body: '' };
  }
  sections.push(current);

  return sections.map((s) => ({ ...s, body: s.body.trim() })).filter((s) => s.body.length > 0);
}

function splitSentences(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
}

/** Hard-split a run of text with no usable boundary. Always makes forward progress. */
function hardSplit(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  for (let start = 0; start < text.length; start += maxChars) {
    parts.push(text.slice(start, start + maxChars));
  }
  return parts;
}

/** Break a section body into units no longer than maxChars: paragraphs, then sentences. */
function toUnits(body: string, maxChars: number): string[] {
  const units: string[] = [];
  for (const paragraph of body.split(/\n\s*\n/)) {
    const p = paragraph.trim();
    if (!p) continue;
    if (p.length <= maxChars) {
      units.push(p);
      continue;
    }
    for (const sentence of splitSentences(p)) {
      if (sentence.length <= maxChars) units.push(sentence);
      else units.push(...hardSplit(sentence, maxChars));
    }
  }
  return units;
}

/** The last ~overlapChars of a chunk, starting on a word boundary. */
function tail(text: string, overlapChars: number): string {
  if (overlapChars <= 0 || text.length <= overlapChars) return '';
  const slice = text.slice(text.length - overlapChars);
  const firstSpace = slice.indexOf(' ');
  return firstSpace === -1 ? slice : slice.slice(firstSpace + 1);
}

/** A chunk under construction: overlap carried from the previous chunk, plus its own units. */
interface Piece {
  overlap: string;
  units: string[];
}

const pieceText = (p: Piece): string => [p.overlap, ...p.units].filter(Boolean).join('\n\n');

function packSection(body: string, opts: ChunkOptions): string[] {
  if (body.length <= opts.maxChars) return [body];

  const pieces: Piece[] = [];
  let current: Piece = { overlap: '', units: [] };
  for (const unit of toUnits(body, opts.maxChars)) {
    const fits = pieceText({ ...current, units: [...current.units, unit] }).length <= opts.maxChars;
    if (fits || current.units.length === 0) {
      current.units.push(unit);
      continue;
    }
    pieces.push(current);
    current = { overlap: tail(pieceText(current), opts.overlapChars), units: [unit] };
    // A full-size unit leaves no room for overlap; keep the bound instead.
    if (pieceText(current).length > opts.maxChars) current.overlap = '';
  }
  pieces.push(current);

  // A short trailing piece carries too little context to retrieve well on its
  // own. Fold its new text into the previous piece — never its overlap, which
  // the previous piece already contains.
  const last = pieces[pieces.length - 1];
  if (pieces.length > 1 && last.units.join('\n\n').length < opts.minChars) {
    pieces.pop();
    pieces[pieces.length - 1].units.push(...last.units);
  }
  return pieces.map(pieceText);
}

export function chunkMarkdown(markdown: string, options: Partial<ChunkOptions> = {}): MarkdownChunk[] {
  const opts = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  if (!markdown || markdown.trim().length === 0) return [];

  const chunks: MarkdownChunk[] = [];
  for (const section of splitSections(markdown)) {
    for (const text of packSection(section.body, opts)) {
      chunks.push({ section: section.heading, text });
    }
  }
  return chunks;
}

/**
 * The text that is embedded, full-text indexed and handed to the model. The
 * "Title › Section" header gives an isolated chunk the context its own words
 * lack ("It also supports…" means nothing without knowing what "it" is).
 */
export function formatChunk(title: string, section: string | null, text: string): string {
  const header = section ? `${title} › ${section}` : title;
  return `${header}\n\n${text}`;
}
