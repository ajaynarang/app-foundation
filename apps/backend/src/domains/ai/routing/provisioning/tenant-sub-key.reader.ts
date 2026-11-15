import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { CredentialCryptoService } from '../credential-crypto.service';

/** The binding label of a sub-key envelope: its additional authenticated data is `tenantId:subkey_openrouter`. */
export const SUB_KEY_BINDING_ID = 'subkey_openrouter';

export interface TenantSubKey {
  apiKey: string;
  /** The row's `updatedAt` in epoch milliseconds: it keys the provider bundle, so a replaced key misses the cache. */
  updatedAtMs: number;
}

/**
 * The read half of the per-workspace OpenRouter sub-keys. It lives in the routing module so the resolver reads it
 * without depending on the provisioning module, which calls OpenRouter.
 *
 * It never fails a resolve. No row, no credentials key, an envelope that will not decrypt, or a database error all
 * return null, and `platform-openrouter` serves on the master `OPENROUTER_API_KEY`. The platform pays either way, so
 * falling back moves no bill; it only loses the per-workspace cap at OpenRouter's edge (the platform cap in the ledger
 * still applies). The reason is logged, never the key.
 */
@Injectable()
export class TenantSubKeyReader {
  private readonly logger = new Logger(TenantSubKeyReader.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialCrypto: CredentialCryptoService,
  ) {}

  async getSubKey(tenantId: number): Promise<TenantSubKey | null> {
    let row: { encryptedKey: string; keyVersion: number; updatedAt: Date } | null;
    try {
      row = await this.prisma.tenantAiSubKey.findUnique({
        where: { tenantId },
        select: { encryptedKey: true, keyVersion: true, updatedAt: true },
      });
    } catch (err) {
      this.logger.warn(
        `Sub-key read failed for workspace ${tenantId}; the master key serves: ${(err as Error).message}`,
      );
      return null;
    }
    if (!row) return null;
    try {
      const apiKey = this.credentialCrypto.decrypt(row.encryptedKey, row.keyVersion, {
        tenantId,
        credentialPublicId: SUB_KEY_BINDING_ID,
      });
      return { apiKey, updatedAtMs: new Date(row.updatedAt).getTime() };
    } catch (err) {
      this.logger.warn(
        `Sub-key decrypt failed for workspace ${tenantId}; the master key serves: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
