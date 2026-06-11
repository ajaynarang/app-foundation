import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inngest } from 'inngest';

import type { ApprovalDecision } from '@app/shared-types';

/**
 * Typed event vocabulary for the Desk — single source of truth.
 * Convention: `app/desk.<responsibility_or_concern>.<event>`.
 *
 * One event per function-start + one per cross-cutting signal (approvals).
 * Each responsibility that ships gets its own `.run` event.
 */
export type DeskEvents = {
  /** Example responsibility-start event for the shipped `welcome`
   * responsibility. Add one `.run` event per responsibility you build; `id`
   * carries the dedupe key so Inngest rejects duplicates (matches the
   * Postgres partial unique index on `desk_episodes(tenant_id, dedupe_key)
   * WHERE status in open). */
  'app/desk.welcome.run': {
    data: {
      episodeId: string;
      tenantId: number;
      idempotencyKey: string;
    };
  };
  /** Published when a human decides an approval — wakes any workflow that's
   * currently awaiting the matching approvalId via step.waitForEvent. */
  'app/desk.approval.decided': {
    data: {
      approvalId: string;
      episodeId: string;
      decision: ApprovalDecision;
      terminateEpisode: boolean;
      editedAction?: Record<string, unknown>;
      rejectionReason?: string;
      decidedByUserId: number;
    };
  };
};

/**
 * Inngest client — one instance shared across trigger service, approval
 * service, domain-event bridge, and the functions they invoke.
 *
 * Local dev: the Inngest CLI dev server polls /api/inngest; no keys needed.
 * Staging/prod: INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY come from AWS
 * Secrets Manager via ECS task def (see infra/terraform P1.14).
 */
@Injectable()
export class InngestClientService implements OnModuleInit {
  private readonly logger = new Logger(InngestClientService.name);
  private _client!: Inngest;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const env = this.config.get<string>('INNGEST_ENV', 'dev');
    const eventKey = this.config.get<string>('INNGEST_EVENT_KEY');
    const signingKey = this.config.get<string>('INNGEST_SIGNING_KEY');

    this._client = new Inngest({
      id: 'app-desk',
      env,
      ...(eventKey ? { eventKey } : {}),
      ...(signingKey ? { signingKey } : {}),
    });

    this.logger.log(`Inngest client initialized (env=${env}, keys=${eventKey && signingKey ? 'cloud' : 'dev'})`);
  }

  get client() {
    return this._client;
  }

  /**
   * Publish a strongly-typed Desk event. `id` (idempotency key) should be
   * the same dedupe key we store on desk_episodes so the runtime, Inngest,
   * and Postgres agree on "one open episode per entity".
   *
   * Type parameter enforces that `data` matches the declared shape for that
   * event name — DeskEvents is the single source of truth for payloads.
   */
  async send<E extends keyof DeskEvents>(name: E, data: DeskEvents[E]['data'], opts?: { id?: string }) {
    await this._client.send({
      name: name as string,
      data: data as unknown as Record<string, unknown>,
      ...(opts?.id ? { id: opts.id } : {}),
    });
  }
}
