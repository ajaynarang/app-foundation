import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { knownKbAudiences } from '../kb-audience';

export interface KnowledgeEntry {
  title: string;
  content: string;
  documentType: 'faq' | 'feature' | 'use_case' | 'comparison' | 'pricing' | 'guide' | 'reference';
  /** One of `knownKbAudiences()` (kb-audience.ts): `all`, or an audience a role in `ROLE_AUDIENCE` reads. */
  audience: string;
  category: string;
  keywords: string[];
  /** Path relative to the content root, e.g. `knowledge-base/getting-started/welcome.md`. The ingester's key. */
  sourcePath: string;
}

const CONTENT_ROOT = path.resolve(process.cwd(), 'content');
const KNOWLEDGE_BASE_DIR = path.join(CONTENT_ROOT, 'knowledge-base');
const PRODUCT_MANUAL_DIR = path.join(CONTENT_ROOT, 'product-manual');

function collectMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

const VALID_DOC_TYPES = new Set(['faq', 'feature', 'use_case', 'comparison', 'pricing', 'guide', 'reference']);

function parseEntries(dir: string): KnowledgeEntry[] {
  const files = collectMarkdownFiles(dir);
  return files.map((filePath) => {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = matter(raw);

    if (!data.title || !data.documentType || !data.audience || !data.category) {
      throw new Error(
        `Missing required frontmatter in ${filePath}: title=${data.title}, documentType=${data.documentType}, audience=${data.audience}, category=${data.category}`,
      );
    }

    if (!VALID_DOC_TYPES.has(data.documentType)) {
      throw new Error(
        `Invalid documentType "${data.documentType}" in ${filePath}. Valid: ${[...VALID_DOC_TYPES].join(', ')}`,
      );
    }

    // Only an audience some caller can read: a file tagged for nobody would be stored and never found.
    const audiences = knownKbAudiences();
    if (!audiences.includes(data.audience)) {
      throw new Error(`Invalid audience "${data.audience}" in ${filePath}. Valid: ${audiences.join(', ')}`);
    }

    return {
      title: data.title,
      content: content.trim(),
      documentType: data.documentType,
      audience: data.audience,
      category: data.category,
      // YAML reads a bare `1099` or `true` as a non-string; the column is text[].
      keywords: ((data.keywords as unknown[] | undefined) ?? []).map(String),
      sourcePath: path.relative(CONTENT_ROOT, filePath).split(path.sep).join('/'),
    };
  });
}

/** Load knowledge base entries */
export function loadKnowledgeEntries(): KnowledgeEntry[] {
  return parseEntries(KNOWLEDGE_BASE_DIR);
}

/** Load product manual entries */
export function loadProductManualEntries(): KnowledgeEntry[] {
  return parseEntries(PRODUCT_MANUAL_DIR);
}

/** Load all entries from both content directories */
export function loadAllEntries(): KnowledgeEntry[] {
  return [...parseEntries(KNOWLEDGE_BASE_DIR), ...parseEntries(PRODUCT_MANUAL_DIR)];
}
