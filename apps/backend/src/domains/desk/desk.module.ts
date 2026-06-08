import { Module } from '@nestjs/common';

import { DeskAgentModule } from './core/agent/desk-agent.module';
import { DeskApprovalModule } from './core/approval/approval.module';
import { DeskEpisodeModule } from './core/episode/desk-episode.module';
import { DeskInngestModule } from './core/inngest/inngest.module';
import { DeskMemoryModule } from './core/memory/desk-memory.module';
import { DeskResponsibilityApiModule } from './core/responsibility/desk-responsibility-api.module';
import { DeskSchedulerModule } from './core/scheduler/desk-scheduler.module';
import { DeskSuppressionModule } from './core/suppression/suppression.module';
import { DeskTriggerModule } from './core/trigger/trigger.module';
import { DeskResponsibilityModule } from './responsibilities/desk-responsibility.module';

/**
 * Sally's Desk (v3) — top-level module.
 *
 * Folder layout (see .docs/plans/06-sally-ai/2026-04-20-desk-architecture-v3.md §8):
 *   core/             — generic Desk infra (inngest client/controller,
 *                       approval, episode step-writer, memory, trigger,
 *                       gate algorithm)
 *   shared-steps/     — reusable step handlers (gate.step, execute.step,
 *                       close.step) + helpers (_llm-step.helper,
 *                       step.types) used by every responsibility
 *   responsibilities/ — one folder per responsibility (definition,
 *                       fan-out, workflow/, steps/, prompts/). New
 *                       responsibilities land here.
 *
 * Phased composition status:
 *   P1.4 ✅ DeskInngestModule      (Inngest client + /api/inngest endpoint)
 *   P1.5 ✅ DeskApprovalModule     (approval service + controller + DTO)
 *   P1.6 ✅ DeskEpisodeModule + DeskMemoryModule
 *            (step writer + memory service used by step handlers)
 *   P1.7 ✅ AR Follow-up function registered in InngestController's serve()
 *   P1.8 ✅ DeskTriggerModule      (fan-out + domain event bridge)
 *   P1.8b ✅ DeskSchedulerModule   (every-minute heartbeat → cron-due
 *                                   responsibility runs, gated behind the
 *                                   tenant master + per-responsibility
 *                                   schedule switches, both default OFF)
 *   P1.9 ✅ Responsibility registry (definitions + seed)
 *   P1.10 ✅ DeskResponsibilityModule (prompt registrar)
 *   P1.11 ✅ DeskResponsibilityApiModule + episode read API
 *            (list/detail/update responsibilities, manual-run, episode
 *            list/detail with steps + approvals)
 */
@Module({
  imports: [
    DeskInngestModule,
    DeskApprovalModule,
    DeskEpisodeModule,
    DeskMemoryModule,
    DeskTriggerModule,
    DeskSchedulerModule,
    DeskAgentModule,
    DeskResponsibilityModule,
    DeskResponsibilityApiModule,
    DeskSuppressionModule,
  ],
  exports: [
    DeskInngestModule,
    DeskApprovalModule,
    DeskEpisodeModule,
    DeskMemoryModule,
    DeskTriggerModule,
    DeskAgentModule,
    DeskResponsibilityModule,
    DeskResponsibilityApiModule,
    DeskSuppressionModule,
  ],
})
export class DeskModule {}
