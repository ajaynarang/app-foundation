import { createHmac } from 'crypto';
import { LEGACY_WEBHOOK_HEADERS, WEBHOOK_HEADERS } from '@app/shared-types';
import {
  buildWebhookHeaders,
  generateWebhookSecret,
  signingSecrets,
  signLegacyWebhook,
  signStandardWebhook,
  webhookSigningKey,
} from '../standard-webhooks';

describe('Standard Webhooks signing', () => {
  it('matches the published Standard Webhooks test vector', () => {
    // From the Standard Webhooks specification's reference test vector.
    expect(
      signStandardWebhook(
        'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
        'msg_p5jXN8AQM9LWM0D4loKWxJek',
        1614265330,
        '{"test": 2432232314}',
      ),
    ).toBe('v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=');
  });

  it('signs "id.timestamp.body": a different id, timestamp or body gives a different signature', () => {
    const secret = generateWebhookSecret();
    const base = signStandardWebhook(secret, 'msg_1', 1_700_000_000, '{"a":1}');
    expect(signStandardWebhook(secret, 'msg_2', 1_700_000_000, '{"a":1}')).not.toBe(base);
    expect(signStandardWebhook(secret, 'msg_1', 1_700_000_001, '{"a":1}')).not.toBe(base);
    expect(signStandardWebhook(secret, 'msg_1', 1_700_000_000, '{"a":2}')).not.toBe(base);
    expect(base).toBe(
      `v1,${createHmac('sha256', webhookSigningKey(secret)).update('msg_1.1700000000.{"a":1}').digest('base64')}`,
    );
  });

  it('issues whsec_ secrets of 32 random bytes', () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^whsec_/);
    expect(webhookSigningKey(secret)).toHaveLength(32);
    expect(generateWebhookSecret()).not.toBe(secret);
  });

  it('derives the key from a hex secret issued before the prefix by the same base64 rule', () => {
    const legacy = 'ab'.repeat(32);
    expect(webhookSigningKey(legacy)).toEqual(Buffer.from(legacy, 'base64'));
  });

  it('builds the headers: one v1 signature per secret, plus the deprecated legacy set', () => {
    const body = '{"event":"app.notification.created"}';
    const headers = buildWebhookHeaders(['whsec_AAAA', 'whsec_BBBB'], {
      id: 'log-1',
      timestamp: 1_700_000_000,
      body,
      event: 'app.notification.created',
      eventVersion: 1,
    });
    expect(headers[WEBHOOK_HEADERS.id]).toBe('log-1');
    expect(headers[WEBHOOK_HEADERS.timestamp]).toBe('1700000000');
    expect(headers[WEBHOOK_HEADERS.signature].split(' ')).toEqual([
      signStandardWebhook('whsec_AAAA', 'log-1', 1_700_000_000, body),
      signStandardWebhook('whsec_BBBB', 'log-1', 1_700_000_000, body),
    ]);
    expect(headers[LEGACY_WEBHOOK_HEADERS.signature]).toBe(
      `sha256=${createHmac('sha256', 'whsec_AAAA').update(body).digest('hex')}`,
    );
    expect(headers[LEGACY_WEBHOOK_HEADERS.signature]).toBe(signLegacyWebhook('whsec_AAAA', body));
    expect(headers[LEGACY_WEBHOOK_HEADERS.event]).toBe('app.notification.created');
    expect(headers[LEGACY_WEBHOOK_HEADERS.delivery]).toBe('log-1');
    expect(headers[LEGACY_WEBHOOK_HEADERS.eventVersion]).toBe('1');
  });
});

describe('signingSecrets (rotation overlap)', () => {
  const now = new Date('2026-11-11T12:00:00Z');

  it('signs with the current secret alone when nothing was rotated', () => {
    expect(signingSecrets({ secret: 'new', previousSecret: null, previousSecretExpiresAt: null }, now)).toEqual([
      'new',
    ]);
  });

  it('signs with both secrets, current first, while the overlap lasts', () => {
    const previousSecretExpiresAt = new Date('2026-11-11T12:00:01Z');
    expect(signingSecrets({ secret: 'new', previousSecret: 'old', previousSecretExpiresAt }, now)).toEqual([
      'new',
      'old',
    ]);
  });

  it('drops the previous secret once the overlap has ended', () => {
    expect(signingSecrets({ secret: 'new', previousSecret: 'old', previousSecretExpiresAt: now }, now)).toEqual([
      'new',
    ]);
    expect(signingSecrets({ secret: 'new', previousSecret: 'old', previousSecretExpiresAt: new Date(0) }, now)).toEqual(
      ['new'],
    );
  });
});
