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
 * Desk — durable workflow engine (Inngest-backed), top-level module.
 *
 * Desk runs long-lived, human-in-the-loop "responsibilities": each one is an
 * Inngest workflow that perceives events, decides via LLM steps, pauses for
 * human approval when needed, and records everything as an episode. The
 * responsibility registry ships empty — add your own under responsibilities/.
 *
 * Folder layout:
 *   core/             — generic Desk infra (inngest client/controller,
 *                       approval, episode step-writer, memory, trigger,
 *                       scheduler, suppression)
 *   shared-steps/     — reusable step handlers (gate.step, execute.step,
 *                       close.step) + helpers (_llm-step.helper,
 *                       step.types) used by every responsibility
 *   responsibilities/ — one folder per responsibility (definition,
 *                       fan-out, workflow/, steps/, prompts/). New
 *                       responsibilities land here.
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
