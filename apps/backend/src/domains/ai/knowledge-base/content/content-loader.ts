import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';

export interface KnowledgeEntry {
  title: string;
  content: string;
  documentType: 'faq' | 'feature' | 'use_case' | 'comparison' | 'pricing' | 'guide' | 'reference';
  audience: 'user' | 'all';
  category: string;
  keywords: string[];
}

const KNOWLEDGE_BASE_DIR = path.resolve(process.cwd(), 'content/knowledge-base');
const PRODUCT_MANUAL_DIR = path.resolve(process.cwd(), 'content/product-manual');

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
const VALID_AUDIENCES = new Set(['user', 'all']);

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

    if (!VALID_AUDIENCES.has(data.audience)) {
      throw new Error(`Invalid audience "${data.audience}" in ${filePath}. Valid: ${[...VALID_AUDIENCES].join(', ')}`);
    }

    return {
      title: data.title,
      content: content.trim(),
      documentType: data.documentType,
      audience: data.audience,
      category: data.category,
      keywords: data.keywords ?? [],
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
