import { CredentialsService } from '../credentials.service';

describe('CredentialsService', () => {
  let service: CredentialsService;

  beforeEach(() => {
    service = new CredentialsService();
  });

  describe('encrypt', () => {
    it('should encrypt plaintext and return iv:encrypted format', () => {
      const result = service.encrypt('my-secret');
      expect(result).toContain(':');
      const [ivHex, encryptedHex] = result.split(':');
      expect(ivHex).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(encryptedHex.length).toBeGreaterThan(0);
    });

    it('should produce different ciphertexts for same input (random IV)', () => {
      const a = service.encrypt('same-value');
      const b = service.encrypt('same-value');
      expect(a).not.toBe(b);
    });
  });

  describe('decrypt', () => {
    it('should decrypt back to original plaintext', () => {
      const encrypted = service.encrypt('hello-world');
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe('hello-world');
    });

    it('should handle special characters', () => {
      const original = 'p@$$w0rd!#%^&*()_+-={}[]|\\:";\'<>?,./~`';
      const encrypted = service.encrypt(original);
      expect(service.decrypt(encrypted)).toBe(original);
    });

    it('should throw for invalid ciphertext format (no colon)', () => {
      expect(() => service.decrypt('invalidformat')).toThrow('Failed to decrypt credentials — data may be corrupted');
    });

    it('should throw for empty IV or encrypted data', () => {
      expect(() => service.decrypt(':encrypted')).toThrow();
      expect(() => service.decrypt('iv:')).toThrow();
    });
  });

  describe('roundtrip', () => {
    it('should handle empty string', () => {
      const encrypted = service.encrypt('');
      expect(service.decrypt(encrypted)).toBe('');
    });

    it('should handle long strings', () => {
      const longStr = 'a'.repeat(10000);
      const encrypted = service.encrypt(longStr);
      expect(service.decrypt(encrypted)).toBe(longStr);
    });

    it('should handle unicode', () => {
      const unicode = 'こんにちは世界 🚛';
      const encrypted = service.encrypt(unicode);
      expect(service.decrypt(encrypted)).toBe(unicode);
    });
  });
});
