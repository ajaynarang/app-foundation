import { spawnSync } from 'child_process';
import * as path from 'path';

/**
 * Loads the REAL @presidio-dev/hai-guardrails package through GuardrailsService.
 *
 * The unit spec mocks the package, and a mocked module loads no matter how it is imported. In the
 * CommonJS build `await import()` became `require()` of an ESM-only package, so every deployed
 * backend failed to build the engines and every guard failed open. This spec runs the service in a
 * child Node process compiled to CommonJS (the production module format) and asserts a real
 * injection is flagged and a benign question is not.
 */
const RESULT_MARKER = 'GUARDRAILS_RESULT ';

describe('GuardrailsService with the real hai-guardrails package', () => {
  const backendRoot = path.resolve(__dirname, '../../../../..');
  const childScript = path.join(backendRoot, 'test/fixtures/guardrails-real-load.child.ts');

  it('loads the engines and flags a prompt injection instead of failing open', () => {
    const run = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', childScript], {
      cwd: backendRoot,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, TS_NODE_PROJECT: path.join(backendRoot, 'tsconfig.json') },
    });

    const output = `${run.stdout}\n${run.stderr}`;
    expect(output).not.toContain('Failed to initialize guardrails engines');
    expect(run.status).toBe(0);
    const resultLine = run.stdout.split('\n').find((line) => line.startsWith(RESULT_MARKER));
    expect(resultLine).toBeDefined();
    const results = JSON.parse(resultLine.slice(RESULT_MARKER.length)) as {
      attack: { flagged: boolean; score?: number };
      benign: { flagged: boolean };
    };
    expect(results.attack.flagged).toBe(true);
    expect(results.attack.score).toBeGreaterThanOrEqual(0.7);
    expect(results.benign.flagged).toBe(false);
  }, 90_000);
});
