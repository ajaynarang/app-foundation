import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/** What a ciphertext is bound to. A ciphertext copied to another tenant's row, or another credential's, fails. */
export interface CredentialBinding {
  tenantId: number;
  credentialPublicId: string;
}

export interface EncryptedSecret {
  ciphertext: string;
  keyVersion: number;
}

const CURRENT_KEY_VERSION = 1;
const IV_BYTES = 12;
const KEY_PATTERN = /^[0-9a-fA-F]{64}$/;
const UNAVAILABLE = 'Workspace AI credentials are unavailable. Contact your operator.';

/**
 * AES-256-GCM envelopes for workspace AI credentials (bring-your-own-key).
 *
 * - Wire format `<ivHex>:<authTagHex>:<cipherHex>`, a fresh 12-byte IV per call.
 * - The additional authenticated data is `tenantId:credentialPublicId`, so a ciphertext moved to another tenant's row,
 *   or another credential's, fails the GCM check instead of decrypting.
 * - `keyVersion` is a rotation counter. Version 1 reads `AI_CREDENTIALS_KEY`. Rotation adds a key and a version, and
 *   re-encrypts rows as they are saved.
 *
 * This is deliberately not the integrations `CredentialsService`: that one has a development default key and does not
 * bind a ciphertext to its owner. Here there is no default and no fallback, ever. Construction never throws, so a
 * machine without the key boots; every encrypt or decrypt then throws a generic 500 (the reason goes to the log only).
 * The key is read through the zod config schema, which already refuses to boot on a key that is not 64 hex characters;
 * the check is repeated here so the class is safe on its own.
 */
@Injectable()
export class CredentialCryptoService {
  private readonly logger = new Logger(CredentialCryptoService.name);

  constructor(private readonly config: ConfigService) {}

  /** True when a usable key is set: bring-your-own-key is on. */
  isConfigured(): boolean {
    return KEY_PATTERN.test(this.config.get<string>('aiCredentialsKey') ?? '');
  }

  encrypt(plaintext: string, binding: CredentialBinding): EncryptedSecret {
    const key = this.keyFor(CURRENT_KEY_VERSION);
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad(binding));
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`,
      keyVersion: CURRENT_KEY_VERSION,
    };
  }

  decrypt(ciphertext: string, keyVersion: number, binding: CredentialBinding): string {
    const key = this.keyFor(keyVersion);
    const [ivHex, tagHex, dataHex] = ciphertext.split(':');
    if (!ivHex || !tagHex || !dataHex) {
      throw new InternalServerErrorException('Failed to decrypt an AI credential: the ciphertext is malformed');
    }
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
      decipher.setAAD(aad(binding));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
    } catch {
      throw new InternalServerErrorException(
        'Failed to decrypt an AI credential: wrong key, wrong workspace or credential, or a tampered ciphertext',
      );
    }
  }

  private keyFor(keyVersion: number): Buffer {
    if (keyVersion !== CURRENT_KEY_VERSION) {
      this.logger.error(`Unknown AI credential key version ${keyVersion} (current: ${CURRENT_KEY_VERSION})`);
      throw new InternalServerErrorException(UNAVAILABLE);
    }
    const hex = this.config.get<string>('aiCredentialsKey') ?? '';
    // Strict: Buffer.from(_, 'hex') stops at the first non-hex character, so a typo would encrypt under another key.
    if (!KEY_PATTERN.test(hex)) {
      this.logger.error(
        'AI_CREDENTIALS_KEY is unset or not 64 hex characters: workspace AI credentials cannot be used',
      );
      throw new InternalServerErrorException(UNAVAILABLE);
    }
    return Buffer.from(hex, 'hex');
  }
}

function aad(binding: CredentialBinding): Buffer {
  return Buffer.from(`${binding.tenantId}:${binding.credentialPublicId}`, 'utf8');
}
