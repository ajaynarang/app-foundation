import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiCredentialStatus, AiCredentialType } from '@appshore/db';
import type { AiCredential, Prisma } from '@appshore/db';
import type {
  AiCredentialConnectResult,
  AiRetentionPolicy,
  AiSettings,
  BedrockBeginResponse,
  BedrockCompleteInput,
  ConnectKeyInput,
  ProbeResult,
} from '@app/shared-types';
import type { EventActor } from '@appshore/kernel/infrastructure/events/domain-event';
import { fieldError, invalidState, stateLabel } from '@appshore/kernel/shared/errors/api-errors';
import { generateId } from '@appshore/kernel/shared/utils/id-generator';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { OutboxService, type OutboxEmit } from '@appshore/platform/infrastructure/events/outbox.service';
import { DOMAIN_EVENTS } from '../../../../platform-glue/events/domain-events.constants';
import { NotificationTriggersService } from '../../../notifications/notification-triggers.service';

import {
  AiRouteResolver,
  MAX_AI_CREDENTIALS_PER_WORKSPACE,
  retentionPolicyCacheKey,
} from '../ai-route-resolver.service';
import { CredentialCryptoService } from '../credential-crypto.service';
import { PASTE_KEY_TYPES, type PasteKeyType } from '../route-registry';
import { BEDROCK_PROFILE_SOURCE_REGIONS } from '../model-catalog';
import { bedrockExternalId, bedrockRoleName, projectSlug } from '../aws-role-naming';
import { bedrockPermissionsPolicy, bedrockTerraformSnippet, bedrockTrustPolicy } from '../bedrock-access';
import { AiCredentialProbeService } from './ai-credential-probe.service';
import { toAiCredentialSummary } from './ai-credential.serializer';

export const AI_CREDENTIAL_PUBLIC_ID_PREFIX = 'aicred';

/** The only status moves the API makes: a test's outcome. DISABLED is never left or entered here. */
const ALLOWED_TRANSITIONS: Record<AiCredentialStatus, AiCredentialStatus[]> = {
  [AiCredentialStatus.ACTIVE]: [AiCredentialStatus.FAILING],
  [AiCredentialStatus.FAILING]: [AiCredentialStatus.ACTIVE],
  [AiCredentialStatus.DISABLED]: [],
};

const NOT_ENABLED = 'Workspace AI keys are not enabled on this deployment';
const BEDROCK_NOT_CONFIGURED =
  'Connecting an AWS Bedrock role is not configured on this deployment (the operator sets PLATFORM_ASSUME_ROLE_ARN)';

/**
 * Bring-your-own-key: the `/ai-settings` business logic. Connect a pasted key (test, then encrypt and store) or the
 * workspace's own AWS Bedrock role (two steps, checked both ways, nothing secret stored), test it again, remove it,
 * and flip the workspace's retention policy.
 *
 * - `AI_CREDENTIALS_KEY` is the switch. Unset, connect (both kinds) and test answer 404; reading the settings, removing a key and
 *   the policy still work, so an owner can clear keys the app can no longer read.
 * - The pasted secret lives only inside `connectKey`. What is stored went through the GCM envelope; what is returned
 *   or stored as a reason went through `redactSecret` (the probe redacts its own detail).
 * - Every write and its event commit together (`OutboxService.transaction`). Events carry the public id and type,
 *   never the secret.
 */
@Injectable()
export class AiCredentialConnectService {
  private readonly logger = new Logger(AiCredentialConnectService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
    private readonly outbox: OutboxService,
    private readonly notifications: NotificationTriggersService,
    private readonly credentialCrypto: CredentialCryptoService,
    private readonly probe: AiCredentialProbeService,
    private readonly aiRouteResolver: AiRouteResolver,
    private readonly config: ConfigService,
  ) {}

  /** True when the operator set `AI_CREDENTIALS_KEY`: workspaces may connect keys. */
  isEnabled(): boolean {
    return this.credentialCrypto.isConfigured();
  }

  async getSettings(tenantId: number): Promise<AiSettings> {
    const policy = await this.policyFor(tenantId);
    const rows = await this.prisma.aiCredential.findMany({
      where: { tenantId },
      orderBy: { priority: 'asc' },
      take: MAX_AI_CREDENTIALS_PER_WORKSPACE,
    });
    return {
      policy,
      byokEnabled: this.isEnabled(),
      payers: await this.aiRouteResolver.describePayers(tenantId),
      credentials: rows.map((row) => toAiCredentialSummary(row, policy)),
    };
  }

  /**
   * Non-destructive: credentials the new policy rules out become inert (kept, dimmed, unused), never deleted. The
   * cached policy is deleted after the commit, so no reader can cache the old value in between, and routing changes on
   * the very next call.
   */
  async updatePolicy(tenantId: number, policy: AiRetentionPolicy, actor: EventActor): Promise<AiSettings> {
    await this.outbox.transaction(async (tx, emit) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { aiZeroRetention: policy === 'ZDR' } });
      await emit(DOMAIN_EVENTS.WORKSPACE_RETENTION_POLICY_CHANGED, tenantId, { policy }, actor);
    });
    await this.cache.del(retentionPolicyCacheKey(tenantId));
    return this.getSettings(tenantId);
  }

  /**
   * Connect a pasted key. Checks, in order: the switch is on; the type is a paste-key type; an attestation only with an
   * Anthropic key; under a zero-retention policy, no OpenRouter or gateway key; room under the per-workspace cap; then
   * the live test. Only a passing key
   * is encrypted and stored, ACTIVE, at the workspace's highest priority plus one.
   */
  async connectKey(
    tenantId: number,
    input: ConnectKeyInput,
    actor: EventActor,
    userDbId: number,
  ): Promise<AiCredentialConnectResult> {
    if (!this.isEnabled()) throw new NotFoundException(NOT_ENABLED);
    const type = input.type as AiCredentialType;
    if (!PASTE_KEY_TYPES.includes(type as PasteKeyType)) {
      throw fieldError('type', 'This credential type is not connected by pasting a key');
    }
    if (input.zdrAttested && type !== AiCredentialType.ANTHROPIC_KEY) {
      throw fieldError('zdrAttested', 'A zero-retention attestation applies to Anthropic keys only');
    }
    const policy = await this.policyFor(tenantId);
    if (policy === 'ZDR' && type !== AiCredentialType.ANTHROPIC_KEY) {
      throw fieldError(
        'type',
        'This workspace requires zero data retention, and this credential type cannot provide it',
      );
    }

    await this.assertRoomForAnother(tenantId);

    const probe = await this.probe.probeKey(type, input.secret);
    if (!probe.ok) throw fieldError('secret', `The key did not pass its test: ${probe.detail}`);

    const publicId = generateId(AI_CREDENTIAL_PUBLIC_ID_PREFIX);
    const envelope = this.credentialCrypto.encrypt(input.secret, { tenantId, credentialPublicId: publicId });
    const attested = type === AiCredentialType.ANTHROPIC_KEY && input.zdrAttested === true;
    const now = new Date();

    const row = await this.outbox.transaction(async (tx, emit) => {
      const saved = await tx.aiCredential.create({
        data: {
          publicId,
          tenantId,
          type,
          status: AiCredentialStatus.ACTIVE,
          priority: await this.nextPriority(tenantId, tx),
          encryptedSecret: envelope.ciphertext,
          keyVersion: envelope.keyVersion,
          lastFour: input.secret.slice(-4),
          zdrAttested: attested,
          zdrAttestedBy: attested ? userDbId : null,
          zdrAttestedAt: attested ? now : null,
          lastValidatedAt: now,
          createdBy: userDbId,
        },
      });
      await emitCredentialEvent(emit, DOMAIN_EVENTS.AI_CREDENTIAL_CONNECTED, saved, actor);
      await emitCredentialEvent(emit, DOMAIN_EVENTS.AI_CREDENTIAL_VALIDATED, saved, actor);
      return saved;
    });

    return { credential: toAiCredentialSummary(row, policy), probe };
  }

  /**
   * Step one of connecting a workspace's own AWS account: what the owner creates there. Stateless: the external id is
   * fixed per workspace (`<project>-<workspace public id>`), so nothing is stored until `completeBedrock` passes. The
   * trust policy names every role this deployment runs as (`PLATFORM_ASSUME_ROLE_ARN`); unset answers 503.
   */
  async beginBedrock(tenantId: number): Promise<BedrockBeginResponse> {
    if (!this.isEnabled()) throw new NotFoundException(NOT_ENABLED);
    const platformRoleArns = this.platformRoleArns();
    const slug = this.projectSlug();
    const externalId = await this.externalIdFor(tenantId, slug);
    const roleName = bedrockRoleName(slug);
    const trustPolicy = bedrockTrustPolicy(platformRoleArns, externalId);
    const permissionsPolicy = bedrockPermissionsPolicy();
    return {
      externalId,
      platformRoleArns,
      roleName,
      trustPolicy: JSON.stringify(trustPolicy, null, 2),
      permissionsPolicy: JSON.stringify(permissionsPolicy, null, 2),
      terraformSnippet: bedrockTerraformSnippet(roleName, trustPolicy, permissionsPolicy),
      cfnQuickCreateUrl: this.config.get<string>('platformBedrockCfnTemplateUrl') ?? null,
    };
  }

  /**
   * Step two: store the workspace's role once it passes. The external id is recomputed here, never taken from the
   * client. Checks, in order: the switch is on; the deployment has a role to be trusted; the region can call the
   * catalog's Bedrock profiles; room under the per-workspace cap; then the live check (`probeBedrock`): AssumeRole with
   * the external id succeeds, without it is refused, and the model answers. A role is zero retention, so any policy
   * allows it. No secret is stored.
   */
  async completeBedrock(
    tenantId: number,
    input: BedrockCompleteInput,
    actor: EventActor,
    userDbId: number,
  ): Promise<AiCredentialConnectResult> {
    if (!this.isEnabled()) throw new NotFoundException(NOT_ENABLED);
    this.platformRoleArns();
    if (!BEDROCK_PROFILE_SOURCE_REGIONS.includes(input.awsRegion)) {
      throw fieldError(
        'awsRegion',
        `The AI models are called through Bedrock's US cross-region profiles, which serve these regions only: ${BEDROCK_PROFILE_SOURCE_REGIONS.join(', ')}`,
      );
    }
    await this.assertRoomForAnother(tenantId);

    const slug = this.projectSlug();
    const externalId = await this.externalIdFor(tenantId, slug);
    const publicId = generateId(AI_CREDENTIAL_PUBLIC_ID_PREFIX);
    const probe = await this.probe.probeBedrock({
      roleArn: input.roleArn,
      externalId,
      awsRegion: input.awsRegion,
      credentialPublicId: publicId,
      projectSlug: slug,
    });
    if (!probe.ok) throw fieldError('roleArn', `The role did not pass its check: ${probe.detail}`);

    const policy = await this.policyFor(tenantId);
    const row = await this.outbox.transaction(async (tx, emit) => {
      const saved = await tx.aiCredential.create({
        data: {
          publicId,
          tenantId,
          type: AiCredentialType.BEDROCK_ROLE,
          status: AiCredentialStatus.ACTIVE,
          priority: await this.nextPriority(tenantId, tx),
          encryptedSecret: null,
          lastFour: null,
          roleArn: input.roleArn,
          externalId,
          awsRegion: input.awsRegion,
          lastValidatedAt: new Date(),
          createdBy: userDbId,
        },
      });
      await emitCredentialEvent(emit, DOMAIN_EVENTS.AI_CREDENTIAL_CONNECTED, saved, actor);
      await emitCredentialEvent(emit, DOMAIN_EVENTS.AI_CREDENTIAL_VALIDATED, saved, actor);
      return saved;
    });

    return { credential: toAiCredentialSummary(row, policy), probe };
  }

  /**
   * Test a stored credential again ("Test again", and the daily sweep). A pass sets it ACTIVE and clears `lastError`; a
   * failure sets it FAILING with the redacted reason. Those are the only status moves the API makes. The owners and
   * admins are told when a credential turns FAILING, not on every failed test of one already failing.
   */
  async validate(tenantId: number, credentialPublicId: string, actor: EventActor): Promise<AiCredentialConnectResult> {
    if (!this.isEnabled()) throw new NotFoundException(NOT_ENABLED);
    const row = await this.findOwned(tenantId, credentialPublicId);
    const wasFailing = row.status === AiCredentialStatus.FAILING;
    const probe = await this.reprobe(row);

    const nextStatus = probe.ok ? AiCredentialStatus.ACTIVE : AiCredentialStatus.FAILING;
    if (nextStatus !== row.status) this.assertTransition(row.status, nextStatus);

    const updated = await this.outbox.transaction(async (tx, emit) => {
      const saved = await tx.aiCredential.update({
        where: { id: row.id },
        data: { status: nextStatus, lastValidatedAt: new Date(), lastError: probe.ok ? null : probe.detail },
      });
      const event = probe.ok ? DOMAIN_EVENTS.AI_CREDENTIAL_VALIDATED : DOMAIN_EVENTS.AI_CREDENTIAL_FAILED;
      await emitCredentialEvent(emit, event, saved, actor);
      return saved;
    });

    if (!probe.ok && !wasFailing) {
      // A notification hiccup never fails the test.
      this.notifications
        .aiCredentialFailing(tenantId, { type: updated.type, lastFour: updated.lastFour }, 'failed-test')
        .catch((err: Error) => this.logger.warn(`AI credential failing notification failed: ${err.message}`));
    }

    return { credential: toAiCredentialSummary(updated, await this.policyFor(tenantId)), probe };
  }

  /** Remove a credential. Works with the switch off, so an owner can clear keys the app can no longer read. */
  async remove(tenantId: number, credentialPublicId: string, actor: EventActor): Promise<void> {
    const row = await this.findOwned(tenantId, credentialPublicId);
    await this.outbox.transaction(async (tx, emit) => {
      await tx.aiCredential.delete({ where: { id: row.id } });
      await emitCredentialEvent(emit, DOMAIN_EVENTS.AI_CREDENTIAL_REMOVED, row, actor);
    });
    // A deleted credential is never rebuilt, so its cached provider (which holds the decrypted secret) is dropped now.
    this.aiRouteResolver.evictCredential(row.id);
  }

  /**
   * Test an existing row. A workspace role runs the two-direction check again with its stored external id; a key is
   * decrypted and probed, and a secret that cannot be decrypted is a failed test.
   */
  private async reprobe(row: AiCredential): Promise<ProbeResult> {
    if (row.type === AiCredentialType.BEDROCK_ROLE) {
      return this.probe.probeBedrock({
        roleArn: row.roleArn ?? '',
        externalId: row.externalId ?? '',
        awsRegion: row.awsRegion ?? '',
        credentialPublicId: row.publicId,
        projectSlug: this.projectSlug(),
      });
    }
    let secret: string;
    try {
      secret = this.credentialCrypto.decrypt(row.encryptedSecret ?? '', row.keyVersion, {
        tenantId: row.tenantId,
        credentialPublicId: row.publicId,
      });
    } catch {
      return {
        ok: false,
        latencyMs: 0,
        detail:
          'The stored key cannot be read on this deployment (the encryption key changed). Remove it and connect it again.',
      };
    }
    return this.probe.probeKey(row.type, secret);
  }

  private assertTransition(from: AiCredentialStatus, to: AiCredentialStatus): void {
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw invalidState(`This credential is ${stateLabel(from)}; a test cannot make it ${stateLabel(to)}`);
    }
  }

  /** The workspace's credential by public id. Another workspace's, or a missing one, is the same 404. */
  private async findOwned(tenantId: number, credentialPublicId: string): Promise<AiCredential> {
    const row = await this.prisma.aiCredential.findFirst({ where: { tenantId, publicId: credentialPublicId } });
    if (!row) throw new NotFoundException('AI credential not found');
    return row;
  }

  private async policyFor(tenantId: number): Promise<AiRetentionPolicy> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { aiZeroRetention: true } });
    return tenant?.aiZeroRetention ? 'ZDR' : 'STANDARD';
  }

  private async assertRoomForAnother(tenantId: number): Promise<void> {
    if ((await this.prisma.aiCredential.count({ where: { tenantId } })) >= MAX_AI_CREDENTIALS_PER_WORKSPACE) {
      throw invalidState(
        `A workspace can hold at most ${MAX_AI_CREDENTIALS_PER_WORKSPACE} AI keys. Remove one before connecting another.`,
      );
    }
  }

  /** The roles this deployment runs as, which a workspace role must trust. None configured answers 503. */
  private platformRoleArns(): string[] {
    const arns = this.config.get<string[]>('platformAssumeRoleArn') ?? [];
    if (arns.length === 0) throw new ServiceUnavailableException(BEDROCK_NOT_CONFIGURED);
    return arns;
  }

  private projectSlug(): string {
    return projectSlug(this.config.get<string>('projectName'));
  }

  /** The workspace's external id, from its public id. Recomputed on every use, never read from a client. */
  private async externalIdFor(tenantId: number, slug: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { tenantId: true } });
    if (!tenant) throw new NotFoundException('Workspace not found');
    return bedrockExternalId(slug, tenant.tenantId);
  }

  private async nextPriority(tenantId: number, tx: Prisma.TransactionClient): Promise<number> {
    const max = await tx.aiCredential.aggregate({ where: { tenantId }, _max: { priority: true } });
    return (max._max.priority ?? -1) + 1;
  }
}

/** Stage a credential event in the write's transaction: the public id and type, never the secret. */
function emitCredentialEvent(emit: OutboxEmit, event: string, row: AiCredential, actor: EventActor): Promise<void> {
  return emit(event, row.tenantId, { credentialPublicId: row.publicId, type: row.type }, actor);
}
