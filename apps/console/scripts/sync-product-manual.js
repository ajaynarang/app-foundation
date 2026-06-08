#!/usr/bin/env node

// Sync product manual content from backend to Console MDX pages.
//
// Reads:  apps/backend/content/product-manual/**/*.md
// Writes: apps/console/src/app/(public)/docs/manual/<path>/page.mdx
//
// Run: node scripts/sync-product-manual.js

const fs = require('fs');
const path = require('path');

const CONTENT_DIR = path.resolve(__dirname, '../../backend/content/product-manual');
const OUTPUT_DIR = path.resolve(__dirname, '../src/app/(public)/docs/manual');
// The root landing page is hand-crafted and should not be deleted
const LANDING_PAGE = path.join(OUTPUT_DIR, 'page.mdx');

const CALLOUT_IMPORT = 'import { Callout } from "@/components/docs/callout";\n\n';

function collectMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) {
    console.warn(`⚠ Product manual content directory not found: ${dir}`);
    console.warn('  Skipping product manual sync. Build will continue.');
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

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

/**
 * Parse YAML frontmatter manually (avoids gray-matter dependency in console).
 * Returns { title, content } where content is everything after the closing ---.
 */
function parseFrontmatter(raw) {
  // Normalize line endings to LF (handles Windows \r\n)
  const normalized = raw.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { title: '', content: normalized };

  const frontmatter = match[1];
  const content = match[2].trim();

  // Extract title from frontmatter
  const titleMatch = frontmatter.match(/title:\s*"?([^"\n]+)"?/);
  const title = titleMatch ? titleMatch[1].trim() : '';

  return { title, content };
}

function mdToMdx(markdownContent, title) {
  let mdx = CALLOUT_IMPORT;
  if (!markdownContent.startsWith('# ')) {
    mdx += `# ${title}\n\n`;
  }
  mdx += markdownContent;
  return mdx;
}

function cleanGeneratedFiles(dir, preserveFile) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (fullPath === preserveFile) continue;

    if (entry.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true });
    } else if (entry.isFile() && entry.name !== 'page.mdx') {
      // Only preserve the root page.mdx (landing page)
      fs.unlinkSync(fullPath);
    }
  }
}

function main() {
  const files = collectMarkdownFiles(CONTENT_DIR);
  if (files.length === 0) return;

  // Clean generated subdirectories but preserve the root landing page
  cleanGeneratedFiles(OUTPUT_DIR, LANDING_PAGE);

  let generated = 0;

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { title, content } = parseFrontmatter(raw);

    // Derive route from file path relative to content dir
    // e.g., getting-started/welcome.md → getting-started/welcome/page.mdx
    const relative = path.relative(CONTENT_DIR, filePath);
    const routeName = relative.replace(/\.md$/, '');
    const outputPath = path.join(OUTPUT_DIR, routeName, 'page.mdx');

    // Ensure directory exists
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Generate MDX content
    const mdxContent = mdToMdx(content, title || 'Untitled');
    fs.writeFileSync(outputPath, mdxContent, 'utf-8');
    generated++;
  }

  console.log(`✓ Synced ${generated} product manual pages to Console docs`);
}

main();
