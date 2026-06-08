import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Service for encrypting and decrypting integration credentials
 * Uses AES-256-CBC encryption
 */
@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);
  private readonly encryptionKey: Buffer;

  constructor() {
    const key = process.env.CREDENTIALS_ENCRYPTION_KEY;

    if (!key) {
      // In development, use a default key (NEVER in production!)
      const defaultKey = 'dev-key-only-do-not-use-in-production-12345678901234567890123456789012';
      console.warn('⚠️ CREDENTIALS_ENCRYPTION_KEY not set, using development key');
      this.encryptionKey = Buffer.from(defaultKey.slice(0, 32));
    } else {
      this.encryptionKey = Buffer.from(key, 'hex');
    }
  }

  /**
   * Encrypt plaintext credentials
   * Returns IV + encrypted data as hex string separated by ':'
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt ciphertext back to plaintext
   * Expects format: 'iv:encrypted' in hex
   */
  decrypt(ciphertext: string): string {
    const [ivHex, encryptedHex] = ciphertext.split(':');

    if (!ivHex || !encryptedHex) {
      throw new InternalServerErrorException('Failed to decrypt credentials — data may be corrupted');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
