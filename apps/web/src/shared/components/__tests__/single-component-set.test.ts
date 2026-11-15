/* global describe, it, expect */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * One component set. The shadcn components live in `@app/ui` and nowhere else: a second copy under
 * `shared/components/ui/` drifts from the first (it did: two FormSheets, two Sheets, two DateRangeFilters), and a
 * screen then gets whichever one its import happens to name.
 *
 * The folder may be absent or empty. A file in it may only re-export from `@app/ui`. Nothing in the web app may
 * import a component through the folder's alias.
 */
const SRC = join(__dirname, '../../..');
const UI_DIR = join(SRC, 'shared/components/ui');
const LOCAL_SET_IMPORT = /['"]@\/shared\/components\/ui(\/[^'"]*)?['"]/;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** True when every statement in the file is a re-export from `@app/ui` (or the `'use client'` directive). */
export function isReExportOnly(source: string): boolean {
  const statements = stripComments(source)
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
  if (statements.length === 0) return false;
  return statements.every(
    (statement) =>
      /^['"]use client['"]$/.test(statement) ||
      /^export\s+(type\s+)?(\*(\s+as\s+\w+)?|\{[^}]*\})\s+from\s+['"]@app\/ui(\/[^'"]*)?['"]$/.test(statement),
  );
}

export function importsLocalSet(source: string): boolean {
  return LOCAL_SET_IMPORT.test(stripComments(source));
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : walk(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('single component set', () => {
  it('knows a re-export from a copy', () => {
    expect(isReExportOnly(`export * from '@app/ui/components/ui/button';`)).toBe(true);
    expect(isReExportOnly(`'use client';\nexport { Sheet, SheetContent } from "@app/ui/components/ui/sheet";`)).toBe(
      true,
    );
    expect(isReExportOnly(`// why\nexport type { ButtonProps } from '@app/ui/components/ui/button';`)).toBe(true);

    expect(isReExportOnly(`export * from '@app/ui/components/ui/button';\nexport const extra = 1;`)).toBe(false);
    expect(isReExportOnly(`export * from '@appshore/web-core/shared/lib/utils';`)).toBe(false);
    expect(isReExportOnly(`export * from './button';`)).toBe(false);
    expect(
      isReExportOnly(`import { Button } from '@app/ui/components/ui/button';\nexport function B() { return Button; }`),
    ).toBe(false);
    expect(isReExportOnly(`/* nothing here */`)).toBe(false);
  });

  it('knows an import through the local folder', () => {
    expect(importsLocalSet(`import { Button } from '@/shared/components/ui/button';`)).toBe(true);
    expect(importsLocalSet(`export { TabsContent } from "@/shared/components/ui/tabs";`)).toBe(true);
    expect(importsLocalSet(`import { Button } from '@app/ui/components/ui/button';`)).toBe(false);
    expect(importsLocalSet(`// was '@/shared/components/ui/button'\nconst a = 1;`)).toBe(false);
    // A different folder: web-only inputs with no twin in @app/ui.
    expect(importsLocalSet(`import { OtpInput } from '@/components/ui/otp-input';`)).toBe(false);
  });

  it('shared/components/ui holds nothing but re-exports from @app/ui', () => {
    const copies = walk(UI_DIR)
      .filter((file) => !isReExportOnly(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(copies).toEqual([]);
  });

  it('no file imports a component through shared/components/ui', () => {
    const importers = walk(SRC)
      .filter((file) => !file.startsWith(UI_DIR) && file !== __filename)
      .filter((file) => importsLocalSet(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(importers).toEqual([]);
  });
});
