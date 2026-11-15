import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

import { CredentialCryptoService } from '../credential-crypto.service';
import { projectSlug } from '../aws-role-naming';
import { SUB_KEY_BINDING_ID } from './tenant-sub-key.reader';
import {
  OpenRouterKeysError,
  createOpenRouterKey,
  revokeOpenRouterKey,
  setOpenRouterKeyLimit,
  type CreatedOpenRouterKey,
} from './openrouter-keys.client';

/** The monthly hard cap of a workspace with no budget row yet: the `TenantAiBudget.monthlyHardUsd` schema default. */
const DEFAULT_MONTHLY_HARD_USD = 200;

/**
 * Per-workspace OpenRouter runtime keys ("sub-keys"). Each workspace gets its own key on the platform's OpenRouter
 * account, capped at the workspace's monthly hard budget (`limit_reset: 'monthly'`), so OpenRouter enforces the cap at
 * its own edge and shows spend per workspace. The platform still pays: this is not a workspace credential and never
 * joins the tenant pool. The resolver's `platform-openrouter` route calls with the key (`TenantSubKeyReader`).
 *
 * Callers are the budget seeder (approval, plan change, personal signup, single-mode boot) and the admin budget editor,
 * never the resolve path. Every method resolves and never rejects; a failure is logged and the master
 * `OPENROUTER_API_KEY` keeps serving the workspace.
 *
 * Off unless both keys are set: `OPENROUTER_PROVISIONING_KEY` (the management key) and `AI_CREDENTIALS_KEY` (the
 * envelope key). The second is checked before OpenRouter is called, so no key is ever minted that could not be stored.
 * If storing still fails after a key was minted (the encrypt or the row write), the key is revoked by its hash at once;
 * a failed revoke is logged at error level with the hash, never the key, so an operator can delete it by hand.
 */
@Injectable()
export class OpenRouterProvisioningService {
  private readonly logger = new Logger(OpenRouterProvisioningService.name);
  private warnedNoCredentialsKey = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialCrypto: CredentialCryptoService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Creates the workspace's sub-key when it has none. Resolves true when a stored key exists after the call (including
   * one stored by a concurrent call), false when sub-keys are off or anything failed.
   */
  async ensureSubKey(tenantId: number): Promise<boolean> {
    const managementKey = this.managementKey();
    if (!managementKey || !this.canStoreKeys()) return false;
    try {
      const existing = await this.prisma.tenantAiSubKey.findUnique({ where: { tenantId }, select: { id: true } });
      if (existing) return true;

      const [tenant, budget] = await Promise.all([
        this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { tenantId: true } }),
        this.prisma.tenantAiBudget.findUnique({ where: { tenantId }, select: { monthlyHardUsd: true } }),
      ]);
      if (!tenant) return false;
      const limitUsd = Number(budget?.monthlyHardUsd ?? DEFAULT_MONTHLY_HARD_USD);

      let created: CreatedOpenRouterKey;
      try {
        created = await createOpenRouterKey(managementKey, { name: this.keyName(tenant.tenantId), limitUsd });
      } catch (err) {
        this.logger.warn(`Sub-key create failed for workspace ${tenantId}: ${(err as Error).message}`);
        const orphan = err instanceof OpenRouterKeysError ? err.orphanHash : undefined;
        if (orphan) await this.revoke(managementKey, orphan, tenantId);
        return false;
      }
      return await this.store(tenantId, created, limitUsd, managementKey);
    } catch (err) {
      this.logger.warn(`Sub-key create errored for workspace ${tenantId}: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Pushes a new monthly cap to the workspace's key, creating the key when it has none. Called after the budget's hard
   * cap may have changed. Resolves and never rejects.
   */
  async syncLimit(tenantId: number, limitUsd: number): Promise<void> {
    const managementKey = this.managementKey();
    if (!managementKey) return;
    try {
      const row = await this.prisma.tenantAiSubKey.findUnique({
        where: { tenantId },
        select: { keyHash: true, limitUsd: true },
      });
      if (!row) {
        await this.ensureSubKey(tenantId);
        return;
      }
      if (Number(row.limitUsd) === limitUsd) return;
      await setOpenRouterKeyLimit(managementKey, row.keyHash, limitUsd);
      await this.prisma.tenantAiSubKey.update({ where: { tenantId }, data: { limitUsd } });
      this.logger.log(`Sub-key limit for workspace ${tenantId} updated`);
    } catch (err) {
      this.logger.warn(`Sub-key limit sync failed for workspace ${tenantId}: ${(err as Error).message}`);
    }
  }

  /**
   * Encrypts and stores a key just minted. Any failure revokes it, so no key lives at OpenRouter that the app does not
   * hold. A lost create race (another call stored a key first) revokes this duplicate and counts as success.
   */
  private async store(
    tenantId: number,
    created: CreatedOpenRouterKey,
    limitUsd: number,
    managementKey: string,
  ): Promise<boolean> {
    let envelope: { ciphertext: string; keyVersion: number };
    try {
      envelope = this.credentialCrypto.encrypt(created.key, { tenantId, credentialPublicId: SUB_KEY_BINDING_ID });
    } catch (err) {
      this.logger.error(`Sub-key for workspace ${tenantId} could not be encrypted: ${(err as Error).message}`);
      await this.revoke(managementKey, created.hash, tenantId);
      return false;
    }
    try {
      await this.prisma.tenantAiSubKey.create({
        data: {
          tenantId,
          encryptedKey: envelope.ciphertext,
          keyVersion: envelope.keyVersion,
          keyHash: created.hash,
          limitUsd,
        },
      });
      this.logger.log(`Provisioned an OpenRouter sub-key for workspace ${tenantId}`);
      return true;
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        this.logger.warn(`Sub-key create raced for workspace ${tenantId}; revoking the duplicate`);
        await this.revoke(managementKey, created.hash, tenantId);
        return true;
      }
      this.logger.error(`Sub-key for workspace ${tenantId} could not be stored: ${(err as Error).message}`);
      await this.revoke(managementKey, created.hash, tenantId);
      return false;
    }
  }

  /** Revokes a key by its hash. A failure is logged at error level with the hash (never the key) for manual cleanup. */
  private async revoke(managementKey: string, hash: string, tenantId: number): Promise<void> {
    try {
      await revokeOpenRouterKey(managementKey, hash);
      this.logger.warn(`Revoked unstored OpenRouter sub-key ${hash} for workspace ${tenantId}`);
    } catch (err) {
      this.logger.error(
        `Could not revoke OpenRouter sub-key ${hash} for workspace ${tenantId} (${(err as Error).message}); ` +
          'delete it by hand in the OpenRouter dashboard (Keys)',
      );
    }
  }

  /** The key's name at OpenRouter: `<product slug>-<workspace public id>`. */
  private keyName(tenantPublicId: string): string {
    return `${projectSlug(this.config.get<string>('projectName'))}-${tenantPublicId}`;
  }

  private managementKey(): string | undefined {
    return this.config.get<string>('openRouterProvisioningKey') || undefined;
  }

  /** False, logged once per process, when `AI_CREDENTIALS_KEY` is unset: a minted key could not be stored. */
  private canStoreKeys(): boolean {
    if (this.credentialCrypto.isConfigured()) return true;
    if (!this.warnedNoCredentialsKey) {
      this.warnedNoCredentialsKey = true;
      this.logger.warn(
        'OPENROUTER_PROVISIONING_KEY is set but AI_CREDENTIALS_KEY is not: per-workspace sub-keys are off and the ' +
          'master OPENROUTER_API_KEY serves every workspace. Set AI_CREDENTIALS_KEY to turn them on.',
      );
    }
    return false;
  }
}
