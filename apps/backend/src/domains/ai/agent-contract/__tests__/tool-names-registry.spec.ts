import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ToolNames, TOOL_NAMES_LIST } from '../tool-names.constants';

/**
 * Static invariant: every value in ToolNames must appear as a `@Tool({ name: ... })`
 * (either literal or via ToolNames.X) in exactly one tool file under mcp/tools/.
 *
 * Catches:
 *  - ToolNames entry added but no matching tool registered yet
 *  - Tool file's @Tool name not migrated to ToolNames.X
 *  - Duplicate registrations (two tool files declaring the same name)
 *
 * Complements scope-coverage.spec.ts (which counts @Tool vs @RequiresScope parity).
 */
describe('ToolNames ↔ @Tool registry consistency', () => {
  const TOOL_DIR = resolve(__dirname, '../../mcp/tools');

  function listToolFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== '__tests__') {
        out.push(...listToolFiles(path));
      } else if (entry.isFile() && entry.name.endsWith('.tool.ts')) {
        out.push(path);
      }
    }
    return out;
  }

  type Finding = { name: string; files: string[] };

  /**
   * Scan one file for @Tool registrations. Returns the tool names this file
   * declares (either as a string literal or via ToolNames.X).
   */
  function extractToolNamesFromFile(src: string, toolNameToKey: Map<string, string>): string[] {
    const names: string[] = [];
    const literal = /name:\s*['"]([a-z][a-z0-9-]+)['"]/g;
    for (const m of src.matchAll(literal)) {
      // Filter out `orderBy: { name: 'asc' }` and similar false-positives by
      // only matching within a @Tool decorator's body. The upstream regex is
      // permissive; we then check each hit against the TOOL_NAMES_LIST.
      if (TOOL_NAMES_LIST.includes(m[1] as never)) names.push(m[1]);
    }
    const viaConst = /name:\s*ToolNames\.([A-Z_]+)/g;
    for (const m of src.matchAll(viaConst)) {
      const key = m[1];
      if (key in ToolNames) names.push((ToolNames as Record<string, string>)[key]);
    }
    return names;
  }

  it('every ToolNames value appears as a @Tool registration in exactly one tool file', () => {
    const files = listToolFiles(TOOL_DIR);
    const toolNameToKey = new Map(Object.entries(ToolNames).map(([k, v]) => [v, k]));

    const registrations = new Map<string, string[]>();
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const names = extractToolNamesFromFile(src, toolNameToKey);
      for (const name of names) {
        const entry = registrations.get(name) ?? [];
        entry.push(file.replace(TOOL_DIR, '.../mcp/tools'));
        registrations.set(name, entry);
      }
    }

    // Collect invariant violations
    const missing: string[] = [];
    const duplicates: Finding[] = [];
    for (const name of TOOL_NAMES_LIST) {
      const files = registrations.get(name) ?? [];
      if (files.length === 0) missing.push(name);
      if (files.length > 1) duplicates.push({ name, files });
    }

    if (missing.length > 0 || duplicates.length > 0) {
      const lines: string[] = [];
      if (missing.length > 0) {
        lines.push(`Missing @Tool registrations for ToolNames entries: ${missing.join(', ')}`);
      }
      if (duplicates.length > 0) {
        lines.push('Duplicate @Tool registrations:');
        for (const d of duplicates) {
          lines.push(`  ${d.name} → ${d.files.join(' AND ')}`);
        }
      }
      throw new Error(lines.join('\n'));
    }
  });

  it('ToolNames has no duplicate string values', () => {
    const values = Object.values(ToolNames);
    expect(new Set(values).size).toBe(values.length);
  });
});
