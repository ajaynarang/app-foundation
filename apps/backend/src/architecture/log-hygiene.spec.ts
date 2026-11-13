import * as fs from 'fs';
import * as path from 'path';
import { listSourceFiles, stripComments } from './source-text.scan';
import {
  consoleCalls,
  firstImport,
  metricFactoryCalls,
  nodeEnvProductionComparisons,
  sensitiveIdentifiers,
  sentryImports,
  tenantLabelMisuse,
  unmaskedLogInterpolations,
  type Finding,
} from './log-hygiene.scan';

/**
 * The logging and telemetry standard, `docs/standards/observability.md`, held as a spec so `pnpm test` (and so
 * `pnpm verify`) checks it on every machine. It reads the backend and the foundation packages as text, line by line,
 * so a failure names the file and the line. What it checks:
 *
 *   - Rule 1: no `NODE_ENV` compared with `'production'` outside `NODE_ENV_ALLOWED`. The environment name comes from
 *     `ENV_TYPE` (`env-label.ts`, `env-type.ts`); `NODE_ENV` is for build and test mode only.
 *   - Rule 3: no logger call interpolates an identifier named like `phone`, `email`, `token`, `otp`, `pin`,
 *     `password`, `secret`, `url`, `recipient`, `html` or `body` unless a mask helper wraps it.
 *   - Rule 7: no `console.*` outside `CONSOLE_ALLOWED`.
 *   - Rule 9: metric instruments are created only in a file named `metrics.ts`, and there `tenant` is a label only on
 *     the three instruments the standard names.
 *   - Rule 10: `@sentry/` is imported only under an `error-tracking/` folder.
 *   - Both process entry points import telemetry first, so auto-instrumentation can patch `pg`, `ioredis` and `http`.
 *
 * Known gaps: a value renamed before logging (`const to = user.phone`) is not caught; `to` and `message` are not on
 * the identifier list because they would flag every `err.message` (the email and SMS senders have their own specs
 * instead); string concatenation (`'to ' + email`) is not read; a name is judged by its last word, so a sensitive
 * word earlier in the name (`otpCode`, `emailTo`, `tokenHash`) is not caught. Rules 2, 4, 5, 6 and 8 are review
 * rules.
 */

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ROOTS = [
  'apps/backend/src',
  'packages/appshore/kernel/src',
  'packages/appshore/platform/src',
  'packages/appshore/db/src',
];

/** Files allowed to compare `NODE_ENV` with `'production'`, each with its reason. */
const NODE_ENV_ALLOWED: Record<string, string> = {
  'packages/appshore/kernel/src/infrastructure/logging/log-filter.ts':
    'a pretty-print decision: quiet noisy paths on a local run only',
};

/** Files allowed to call `console.*`, each with its reason. A path ending in `/` covers its folder. */
const CONSOLE_ALLOWED: Record<string, string> = {
  'apps/backend/src/main.ts': 'process entry point: prints the ready banner',
  'apps/backend/src/domains/ai/voice/voice-agent.entry.ts': 'process entry point, before any logger exists',
  'apps/backend/src/config/configuration.ts': 'config load runs before the logger exists',
  'packages/appshore/platform/src/config/firebase.config.ts': 'runs from the entry points before the app exists',
  'packages/appshore/kernel/src/infrastructure/telemetry/': 'telemetry bootstrap, loaded before anything else',
};

/** CLI commands print to the terminal they run in. */
const CLI_COMMAND = /\.command\.ts$/;
/** The error-tracking bootstrap (item 6) may print before the logger exists. */
const ERROR_TRACKING = /\/error-tracking\//;

const ENTRY_POINTS = ['apps/backend/src/main.ts', 'apps/backend/src/worker.ts'];
const TELEMETRY_MODULE = '@appshore/kernel/infrastructure/telemetry/telemetry';

interface SourceFile {
  rel: string;
  code: string;
}

const files: SourceFile[] = ROOTS.flatMap((root) =>
  listSourceFiles(path.join(REPO, root)).map((abs) => ({
    rel: path.relative(REPO, abs).split(path.sep).join('/'),
    code: stripComments(fs.readFileSync(abs, 'utf8')),
  })),
);

function report(check: (code: string) => Finding[], include: (rel: string) => boolean = () => true): string[] {
  return files
    .filter((f) => include(f.rel))
    .flatMap((f) => check(f.code).map((hit) => `${f.rel}:${hit.line}  ${hit.text}`));
}

const consoleAllowed = (rel: string) =>
  CLI_COMMAND.test(rel) ||
  ERROR_TRACKING.test(rel) ||
  Object.keys(CONSOLE_ALLOWED).some((entry) => (entry.endsWith('/') ? rel.startsWith(entry) : rel === entry));

describe('log hygiene: the checks themselves', () => {
  it('rule 3 flags an unmasked email, phone, token or URL and passes a masked one', () => {
    const src = [
      'this.logger.log(`Email sent to ${options.to} for ${user.email}`);',
      'this.logger.warn(`SMS to ${maskPhone(phone)} sent`);',
      'logger.error(`Refused ${subscription.url}: ${reason}`);',
      'this.logger.log(`reset ${resetToken}`);',
      'new Logger("X").debug(`ok ${maskEmail(dto.email)} ${count}`);',
      'this.logger.log(`Failed: ${err.message}`);',
      'this.logger.error({ msg: `multi-line ${',
      '  mockOtp',
      '}` });',
    ].join('\n');

    expect(unmaskedLogInterpolations(src).map((f) => f.line)).toEqual([1, 3, 4, 7]);
  });

  it('rule 3 judges a name by its head noun and a member chain by what it ends in', () => {
    const flagged = (expr: string) => sensitiveIdentifiers(expr).length > 0;

    expect(flagged('user.email.toLowerCase()')).toBe(true);
    expect(flagged('dto.phoneNumber')).toBe(true);
    expect(flagged('resetUrl')).toBe(true);
    expect(flagged('process.env.APP_API_URL')).toBe(true);
    expect(flagged('decodedToken.uid')).toBe(false);
    expect(flagged('this.emailProvider')).toBe(false);
    expect(flagged('recipient.id')).toBe(false);
    expect(flagged('redactedUrl')).toBe(false);
    expect(flagged('tokens.length')).toBe(false);
  });

  it('rule 3 ignores interpolations outside logger calls', () => {
    expect(unmaskedLogInterpolations('const link = `${appUrl}/reset?token=${rawToken}`;')).toEqual([]);
  });

  it('rule 1 flags NODE_ENV compared with production, either way round, and nothing else', () => {
    const src = [
      "const a = process.env.NODE_ENV === 'production';",
      "if (process.env.NODE_ENV !== 'production') {}",
      "const b = 'production' === process.env.NODE_ENV;",
      'const c = process.env[\'NODE_ENV\'] === "production";',
      "const d = process.env.NODE_ENV === 'development';",
      "const e = getEnvType() === 'production';",
    ].join('\n');

    expect(nodeEnvProductionComparisons(src).map((f) => f.line)).toEqual([1, 2, 3, 4]);
  });

  it('rule 7 flags console calls', () => {
    expect(consoleCalls("console.log('x');\nconst consoleLike = 1;\nconsole .warn('y');").map((f) => f.line)).toEqual([
      1, 3,
    ]);
  });

  it('rule 9 flags instrument creation and a tenant label on any other instrument', () => {
    expect(metricFactoryCalls("const c = meter.createCounter('app_x');").map((f) => f.line)).toEqual([1]);

    const metrics = [
      "  jobFailed: meter.createCounter('app_job_failed', {}),",
      "  outboundFailed: meter.createCounter('app_outbound_failed', {}),",
      'set.jobFailed.add(1, { queue, tenant: toTenantLabel(id) });',
      'set.outboundFailed.add(1, { channel, tenant });',
      'set.outboundFailed.add(1, { channel });',
    ].join('\n');
    expect(tenantLabelMisuse(metrics).map((f) => f.line)).toEqual([4]);
  });

  it('rule 10 flags every form of a Sentry import', () => {
    const src = [
      "import * as Sentry from '@sentry/nestjs';",
      "const s = require('@sentry/node');",
      "import '@sentry/nestjs';",
      "import { x } from '@appshore/kernel';",
    ].join('\n');
    expect(sentryImports(src).map((f) => f.line)).toEqual([1, 2, 3]);
  });

  it('reads the first import of a file', () => {
    expect(firstImport("// hi\nimport { a } from './a';\nimport './b';")).toBe('./a');
    expect(firstImport("import './side-effect';")).toBe('./side-effect');
  });
});

describe('log hygiene: the repository', () => {
  it('reads the source tree', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('rule 1: no NODE_ENV production comparison outside the allow-list', () => {
    expect(report(nodeEnvProductionComparisons, (rel) => !(rel in NODE_ENV_ALLOWED))).toEqual([]);
  });

  it('rule 3: no logger call interpolates personal data or a credential unmasked', () => {
    expect(report(unmaskedLogInterpolations)).toEqual([]);
  });

  it('rule 7: no console call outside the allow-list', () => {
    expect(report(consoleCalls, (rel) => !consoleAllowed(rel))).toEqual([]);
  });

  it('rule 9: metric instruments are created only in metrics.ts', () => {
    expect(report(metricFactoryCalls, (rel) => !rel.endsWith('/metrics.ts'))).toEqual([]);
  });

  it('rule 9: tenant is a label only on the three named instruments', () => {
    expect(report(tenantLabelMisuse, (rel) => rel.endsWith('/metrics.ts'))).toEqual([]);
  });

  it('rule 10: the Sentry SDK is imported only under error-tracking/', () => {
    expect(report(sentryImports, (rel) => !ERROR_TRACKING.test(rel))).toEqual([]);
  });

  it('both process entry points import telemetry first', () => {
    for (const entry of ENTRY_POINTS) {
      expect({ entry, first: firstImport(fs.readFileSync(path.join(REPO, entry), 'utf8')) }).toEqual({
        entry,
        first: TELEMETRY_MODULE,
      });
    }
  });

  it('every allow-list entry names a file that still needs it, with a reason', () => {
    const stale: string[] = [];
    for (const [entry, reason] of Object.entries(NODE_ENV_ALLOWED)) {
      const file = files.find((f) => f.rel === entry);
      if (!reason || !file || nodeEnvProductionComparisons(file.code).length === 0) stale.push(entry);
    }
    for (const [entry, reason] of Object.entries(CONSOLE_ALLOWED)) {
      const covered = files.filter((f) => (entry.endsWith('/') ? f.rel.startsWith(entry) : f.rel === entry));
      if (!reason || !covered.some((f) => consoleCalls(f.code).length > 0)) stale.push(entry);
    }
    expect(stale).toEqual([]);
  });
});
