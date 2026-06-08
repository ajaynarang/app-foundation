import { DeskEpisodeStepKind } from '@prisma/client';
import type { AgentScope } from '@app/shared-types';
import { scopeTier } from '@app/shared-types';

import { nestApp } from '../core/inngest/nest-context';
import { fromDeskResponsibility } from '../../ai/agent-contract/agent-principal';
import { InvocationPipelineService } from '../../ai/agent-contract/invocation-pipeline.service';
import { ScopeRegistryService } from '../../ai/agent-contract/scope-registry.service';
import { DeskStepWriter } from '../core/episode/desk-step-writer.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { findResponsibilityDefinition } from '../responsibilities';

import type { ExecuteInput, ExecuteOutput } from './step.types';

/**
 * execute step — runs a single tool via the Agent Contract pipeline.
 *
 * Contract with the pipeline (Phase A/B architecture):
 *   • Constructs a DeskResponsibilityPrincipal (tenant + responsibility id
 *     + scopes granted at responsibility-enable time)
 *   • Scopes come from the scope registry — one per tool used by this
 *     responsibility's workflow
 *   • Pipeline handles: scope check → rate limit → HITL → AgentInvocationLog
 *     → actual tool execution → log update
 *
 * Our layer of gate happened upstream (gate.step); by the time we're
 * here, the Desk-side decision is already "proceed". The pipeline's own
 * HITL resolution will be 'none' for standard scopes from a Desk principal
 * (see HitlPolicyService) so it won't ask for a second approval.
 *
 * Writes one desk_episode_steps row with kind='execute', toolName +
 * toolScope + toolTier from the registry, and toolResult captured.
 */
export async function executeStep(input: ExecuteInput): Promise<ExecuteOutput> {
  const app = nestApp();
  const prisma = app.get(PrismaService);
  const pipeline = app.get(InvocationPipelineService);
  const scopeRegistry = app.get(ScopeRegistryService);
  const stepWriter = app.get(DeskStepWriter);

  const episode = await prisma.deskEpisode.findUniqueOrThrow({
    where: { id: input.episodeId },
    select: {
      tenantId: true,
      responsibilityId: true,
      responsibility: { select: { key: true } },
      ownerAgent: {
        select: {
          supervisorUserId: true,
        },
      },
    },
  });

  // Resolve the responsibility definition — the single source of truth for
  // the workflow tool inventory. Fail-closed (open + fail a step row) if
  // the key has no registry definition, mirroring the unknown-tool path.
  const definition = findResponsibilityDefinition(episode.responsibility.key);
  if (!definition) {
    const step = await stepWriter.open({
      episodeId: input.episodeId,
      kind: DeskEpisodeStepKind.EXECUTE,
      toolName: input.tool,
    });
    await stepWriter.failed({
      stepId: step.id,
      errorMessage: `execute: unknown responsibility "${episode.responsibility.key}" — no registry definition`,
    });
    throw new Error(`execute: unknown responsibility "${episode.responsibility.key}"`);
  }

  const toolScope = scopeRegistry.scopeForTool(input.tool) ?? null;
  if (!toolScope) {
    // Fail-closed at execute time — matches the gate-algorithm behavior
    // for unknown tools. We open + fail a step so the episode timeline
    // shows what happened.
    const step = await stepWriter.open({
      episodeId: input.episodeId,
      kind: DeskEpisodeStepKind.EXECUTE,
      toolName: input.tool,
    });
    await stepWriter.failed({
      stepId: step.id,
      errorMessage: `execute: unknown tool "${input.tool}" — no scope registered`,
    });
    throw new Error(`execute: unknown tool "${input.tool}"`);
  }

  // Resolve the supervisor that will own this invocation BEFORE we open the
  // step row. The principal factory enforces a positive DB id; if the agent
  // has no supervisor assigned we surface a clean failed step so the episode
  // can close + show in Handled, instead of throwing past stepWriter.open
  // and stranding orphan RUNNING rows on every Inngest retry.
  const supervisorUserId = episode.ownerAgent.supervisorUserId;
  if (supervisorUserId == null) {
    const step = await stepWriter.open({
      episodeId: input.episodeId,
      kind: DeskEpisodeStepKind.EXECUTE,
      toolName: input.tool,
      toolScope,
      toolTier: scopeTier(toolScope),
    });
    await stepWriter.failed({
      stepId: step.id,
      errorMessage:
        'execute: agent has no supervisor — assign a supervisor on the agent before enabling this responsibility',
    });
    throw new Error('execute: agent has no supervisor');
  }

  const tier = scopeTier(toolScope);

  const step = await stepWriter.open({
    episodeId: input.episodeId,
    kind: DeskEpisodeStepKind.EXECUTE,
    toolName: input.tool,
    toolScope,
    toolTier: tier,
  });

  try {
    // Compute the set of scopes the principal carries — union of every tool
    // scope the workflow may call. Tool inventory comes from the
    // responsibility definition (single source of truth); scopes are
    // derived from the scope registry — no hand-maintained list. This keeps
    // the principal minimally-scoped to what the responsibility needs.
    const scopes: AgentScope[] = Array.from(
      new Set(
        definition.tools.map((t) => scopeRegistry.scopeForTool(t)).filter((s): s is AgentScope => s !== undefined),
      ),
    );

    const principal = fromDeskResponsibility({
      responsibilityId: episode.responsibilityId,
      tenantId: episode.tenantId,
      scopes,
      enabledByUserId: supervisorUserId,
    });

    const result = await pipeline.run(principal, input.tool, {
      ...input.args,
      // McpToolService normally injects _tenantId from the session; for
      // Desk invocations we inject it from the principal. Keeps tools
      // tenant-scoped without relying on the session guard path.
      _tenantId: episode.tenantId,
    });

    if (result.isError) {
      const errText = result.content?.[0]?.type === 'text' ? result.content[0].text : 'unknown';
      throw new Error(`pipeline error: ${errText}`);
    }

    await stepWriter.succeeded({
      stepId: step.id,
      toolArgs: input.args,
      toolResult: result as unknown as Record<string, unknown>,
    });

    return { toolResult: result as unknown as Record<string, unknown> };
  } catch (err) {
    await stepWriter.failed({
      stepId: step.id,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
