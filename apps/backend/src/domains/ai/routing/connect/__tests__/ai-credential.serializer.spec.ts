import { AiCredentialStatus, AiCredentialType } from '@appshore/db';
import { toAiCredentialSummary } from '../ai-credential.serializer';

function row(overrides: Record<string, unknown> = {}): any {
  return {
    id: 42,
    publicId: 'aicred_ser0000001',
    tenantId: 7,
    type: AiCredentialType.ANTHROPIC_KEY,
    status: AiCredentialStatus.ACTIVE,
    priority: 0,
    encryptedSecret: 'aa:bb:cc',
    keyVersion: 1,
    lastFour: 'k123',
    roleArn: null,
    externalId: null,
    awsRegion: null,
    zdrAttested: false,
    zdrAttestedBy: null,
    zdrAttestedAt: null,
    lastValidatedAt: new Date('2026-07-11T00:00:00Z'),
    lastError: null,
    createdBy: 1,
    createdAt: new Date('2026-07-10T00:00:00Z'),
    updatedAt: new Date('2026-07-10T00:00:00Z'),
    ...overrides,
  };
}

describe('toAiCredentialSummary', () => {
  it('never leaks internal fields (numeric id, envelope, ExternalId, keyVersion, who created or attested)', () => {
    const out = toAiCredentialSummary(
      row({ roleArn: 'arn:aws:iam::123456789012:role/x', externalId: 'external-binding-value' }),
      'STANDARD',
    ) as Record<string, unknown>;
    expect(out).not.toHaveProperty('id');
    expect(out).not.toHaveProperty('tenantId');
    expect(out).not.toHaveProperty('encryptedSecret');
    expect(out).not.toHaveProperty('externalId');
    expect(out).not.toHaveProperty('keyVersion');
    expect(out).not.toHaveProperty('createdBy');
    expect(out).not.toHaveProperty('zdrAttestedBy');
    expect(JSON.stringify(out)).not.toContain('aa:bb:cc');
    expect(JSON.stringify(out)).not.toContain('external-binding-value');
  });

  it.each([
    [AiCredentialType.ANTHROPIC_KEY, false, true], // unattested anthropic is inert under ZDR
    [AiCredentialType.OPENROUTER_KEY, false, true],
    [AiCredentialType.VERCEL_GATEWAY_KEY, false, true],
    [AiCredentialType.BEDROCK_ROLE, false, false], // bedrock is ZDR-native → never inert
  ])('inertUnderPolicy for %s (attested=%s) under ZDR = %s', (type, attested, expected) => {
    const out = toAiCredentialSummary(row({ type, zdrAttested: attested }), 'ZDR');
    expect(out.inertUnderPolicy).toBe(expected);
  });

  it('an ATTESTED anthropic key is not inert under ZDR', () => {
    const out = toAiCredentialSummary(row({ zdrAttested: true, zdrAttestedAt: new Date() }), 'ZDR');
    expect(out.inertUnderPolicy).toBe(false);
  });

  it('nothing is inert under STANDARD', () => {
    for (const type of Object.values(AiCredentialType)) {
      const out = toAiCredentialSummary(row({ type }), 'STANDARD');
      expect(out.inertUnderPolicy).toBe(false);
    }
  });

  it('carries exactly the card fields the settings page shows', () => {
    expect(Object.keys(toAiCredentialSummary(row(), 'STANDARD')).sort()).toEqual(
      [
        'publicId',
        'type',
        'status',
        'priority',
        'lastFour',
        'awsRegion',
        'roleArn',
        'zdrAttested',
        'zdrAttestedAt',
        'inertUnderPolicy',
        'lastValidatedAt',
        'lastError',
        'createdAt',
      ].sort(),
    );
  });

  it('serializes dates as ISO strings', () => {
    const out = toAiCredentialSummary(row(), 'STANDARD');
    expect(out.createdAt).toBe('2026-07-10T00:00:00.000Z');
    expect(out.lastValidatedAt).toBe('2026-07-11T00:00:00.000Z');
  });
});
