import * as fs from 'fs';
import * as path from 'path';

/**
 * Outbound gate coverage (ADR "Outbound gate").
 *
 * Every place that can email, text, push or call back a real person must pass the outbound gate, or a test
 * environment can message real customers. This scans `apps/backend/src` and `packages/appshore/*\/src` for the send
 * primitives and fails when one appears in a file that is not on the gated list below, or when a gated file stops
 * using the gate.
 *
 * Adding a sender? Route it through EmailService, SmsService, PushService or FcmService if you can. If it truly needs
 * its own client, inject `OUTBOUND_GATE` (from `@appshore/kernel/infrastructure/outbound/outbound-gate.port`), call
 * it before the provider, and add the file here in the same pull request.
 */

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ROOTS = [
  path.join(REPO, 'apps', 'backend', 'src'),
  ...fs
    .readdirSync(path.join(REPO, 'packages', 'appshore'))
    .map((pkg) => path.join(REPO, 'packages', 'appshore', pkg, 'src'))
    .filter((dir) => fs.existsSync(dir)),
];

const SEND_PRIMITIVES: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'Resend client', pattern: /new Resend\(|import\(['"]resend['"]\)|from ['"]resend['"]/ },
  { name: 'Twilio client', pattern: /require\(['"]twilio['"]\)|from ['"]twilio['"]/ },
  { name: 'SMTP transport', pattern: /nodemailer\.createTransport|\.sendMail\(/ },
  { name: 'Web Push send', pattern: /webpush\.sendNotification/ },
  { name: 'FCM send', pattern: /sendEachForMulticast|\.messaging\(\)\.send/ },
  // The WhatsApp adapters (Interakt, Meta Cloud) are the send primitive: only the send handler may call them.
  { name: 'WhatsApp template send', pattern: /\.sendTemplate\(/ },
];

/** Files allowed to hold a send primitive. Each must use the gate. */
const GATED_FILES = [
  'packages/appshore/kernel/src/infrastructure/sms/sms.service.ts',
  'packages/appshore/platform/src/infrastructure/sms/twilio-verify.service.ts',
  'packages/appshore/platform/src/infrastructure/notification/services/email.service.ts',
  'packages/appshore/platform/src/infrastructure/notifications/channels/push/fcm.service.ts',
  'packages/appshore/platform/src/infrastructure/notifications/channels/push/web-push.service.ts',
  'packages/appshore/platform/src/infrastructure/notifications/channels/whatsapp/whatsapp-send.handler.ts',
];

/** Senders whose transport is plain HTTP (no scannable primitive), checked by name. */
const GATED_HTTP_SENDERS = ['apps/backend/src/platform-glue/webhooks/delivery.processor.ts'];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '__tests__', 'testing', 'test'].includes(entry.name)) continue;
      out.push(...listSourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const relative = (file: string) => path.relative(REPO, file).split(path.sep).join('/');
/** Injects the port and calls it: a stray import alone does not count. */
const usesGate = (source: string) => source.includes('OUTBOUND_GATE') && /this\.outboundGate\.\w+\(/.test(source);

describe('outbound gate coverage', () => {
  const files = ROOTS.flatMap((root) => listSourceFiles(root)).map((file) => ({
    file: relative(file),
    source: fs.readFileSync(file, 'utf8'),
  }));

  it('scans the backend and every foundation package (sanity)', () => {
    expect(files.some(({ file }) => file.startsWith('apps/backend/src/'))).toBe(true);
    expect(files.some(({ file }) => file.startsWith('packages/appshore/kernel/src/'))).toBe(true);
    expect(files.some(({ file }) => file.startsWith('packages/appshore/platform/src/'))).toBe(true);
  });

  it('finds no send primitive outside the gated files', () => {
    const offenders = files.flatMap(({ file, source }) =>
      SEND_PRIMITIVES.filter(({ pattern }) => pattern.test(source))
        .filter(() => !GATED_FILES.includes(file))
        .map(({ name }) => `${file} (${name})`),
    );

    expect(offenders).toEqual([]);
  });

  it.each([...GATED_FILES, ...GATED_HTTP_SENDERS])('%s injects and calls the outbound gate', (file) => {
    const match = files.find((candidate) => candidate.file === file);
    expect(match).toBeDefined();
    expect(usesGate(match?.source ?? '')).toBe(true);
  });

  it('every gated file still holds a send primitive, so the list does not go stale', () => {
    const stale = GATED_FILES.filter((file) => {
      const source = files.find((candidate) => candidate.file === file)?.source ?? '';
      return !SEND_PRIMITIVES.some(({ pattern }) => pattern.test(source));
    });
    expect(stale).toEqual([]);
  });
});
