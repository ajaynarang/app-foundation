/**
 * Codegen: Prisma enums → @sally/shared-types Zod mirrors.
 *
 * Reads `apps/backend/prisma/schema.prisma`, finds every `enum X { ... }`
 * block, and writes `packages/shared-types/src/generated/prisma-enums.ts`
 * with a matching `z.enum([...])` schema, an inferred TypeScript type,
 * and a value-bag const for ergonomic member access.
 *
 * Chained into `pnpm prisma:generate` (see package.json) so any schema
 * edit auto-updates the frontend mirror. The committed mirror is checked
 * in CI by `apps/backend/src/architecture/enum-codegen-parity.spec.ts`
 * which regenerates and asserts no diff — adding a value to schema.prisma
 * without regenerating fails the build.
 *
 * Single source of truth: schema.prisma. Backend imports from
 * `@prisma/client`; frontend imports from `@sally/shared-types`. Same
 * names, same values, structurally guaranteed.
 */
import * as fs from 'fs';
import * as path from 'path';

const SCHEMA_PATH = path.resolve(__dirname, '..', 'prisma', 'schema.prisma');
const OUTPUT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'packages',
  'shared-types',
  'src',
  'generated',
  'prisma-enums.ts',
);

interface PrismaEnum {
  name: string;
  values: string[];
}

function parseEnums(schema: string): PrismaEnum[] {
  const enumRe = /^enum\s+(\w+)\s*\{([^}]+)\}/gm;
  const out: PrismaEnum[] = [];
  let match: RegExpExecArray | null;
  while ((match = enumRe.exec(schema))) {
    const name = match[1];
    const body = match[2];
    const values = body
      .split('\n')
      .map((line) => line.replace(/\/\/.*/, '').trim()) // strip line comments
      .filter((line) => line && !line.startsWith('@@') && !line.startsWith('@'))
      .map((line) => line.split(/\s+/)[0])
      .filter(Boolean);
    if (values.length === 0) continue;
    out.push({ name, values });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function emit(enums: PrismaEnum[]): string {
  const header = `/* eslint-disable */
/**
 * AUTO-GENERATED — do not edit by hand.
 *
 * Run \`pnpm prisma:generate\` from \`apps/backend\` to regenerate from
 * \`prisma/schema.prisma\`.
 *
 * Source:    apps/backend/prisma/schema.prisma
 * Generator: apps/backend/scripts/generate-shared-enums.ts
 *
 * CI guarantees this file stays in sync via
 * apps/backend/src/architecture/enum-codegen-parity.spec.ts — it
 * regenerates on every run and fails on any diff.
 */
import { z } from 'zod';

`;
  const blocks = enums.map((e) => {
    const valuesLiteral = e.values.map((v) => `'${v}'`).join(', ');
    return `// ${e.name}
export const ${e.name}Schema = z.enum([${valuesLiteral}] as const);
export type ${e.name} = z.infer<typeof ${e.name}Schema>;
export const ${e.name} = ${e.name}Schema.enum;`;
  });
  return header + blocks.join('\n\n') + '\n';
}

function main(): void {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const enums = parseEnums(schema);
  const output = emit(enums);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, output);
  // eslint-disable-next-line no-console
  console.log(`Generated ${enums.length} Prisma enums → ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

main();
