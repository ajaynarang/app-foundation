import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Codegen parity guardrail.
 *
 * The generated `packages/shared-types/src/generated/prisma-enums.ts`
 * file MUST stay in sync with `packages/foundation/db/prisma/schema/*.prisma`.
 * If anyone edits the schema without running `pnpm prisma:generate`
 * (which chains the codegen script), this test fails CI — preventing
 * the drift class that produced the April-28 incident.
 *
 * The test simply re-runs the codegen script into a temp file and
 * diffs against the committed file. No fix-on-the-fly behavior — a
 * drift means the dev forgot to commit the regenerated artifact.
 */
describe('Prisma → shared-types enum codegen parity', () => {
  // From apps/backend/src/architecture/ → repo root is 4 levels up.
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const generatedPath = path.join(repoRoot, 'packages', 'shared-types', 'src', 'generated', 'prisma-enums.ts');
  const codegenScript = path.join(repoRoot, 'packages', 'foundation', 'db', 'scripts', 'generate-shared-enums.ts');

  it('committed prisma-enums.ts is in sync with the prisma schema', () => {
    const committed = fs.readFileSync(generatedPath, 'utf8');

    // Stash the committed file, regenerate, compare, restore.
    const tmpBackup = `${generatedPath}.bak`;
    fs.copyFileSync(generatedPath, tmpBackup);

    try {
      execSync(`npx tsx ${codegenScript}`, {
        cwd: repoRoot,
        stdio: 'pipe',
      });
      const regenerated = fs.readFileSync(generatedPath, 'utf8');

      if (regenerated !== committed) {
        // Restore so the test doesn't leave a dirty checkout.
        fs.copyFileSync(tmpBackup, generatedPath);
        const message = [
          'Generated prisma-enums.ts is out of sync with the prisma schema.',
          'Run `pnpm --filter @appshore/db prisma:generate` and commit the regenerated file.',
        ].join('\n');
        throw new Error(message);
      }
    } finally {
      fs.unlinkSync(tmpBackup);
    }
  });
});
