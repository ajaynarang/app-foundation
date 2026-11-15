import { redactSecret } from '../redact-secret';

describe('redactSecret', () => {
  it('removes the exact secret wherever it appears', () => {
    const secret = 'my-provider-key-1234567890';
    expect(redactSecret(`bad key ${secret} (${secret})`, secret)).toBe('bad key [redacted] ([redacted])');
  });

  it('removes anything shaped like an sk- key, with or without the secret given', () => {
    expect(redactSecret('Invalid key sk-ant-api03-abcdefghijkl given')).toBe('Invalid key [redacted] given');
    expect(redactSecret('key sk-or-v1-0123456789abcdef', 'other-secret-value')).toBe('key [redacted]');
  });

  it('leaves text with no secret alone, and ignores a secret too short to match safely', () => {
    expect(redactSecret('401 Unauthorized', 'abc')).toBe('401 Unauthorized');
  });

  it('caps a long provider message', () => {
    expect(redactSecret('x'.repeat(5000)).length).toBeLessThanOrEqual(1000);
  });
});
