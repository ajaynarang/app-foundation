import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { StructuredOutputService } from '../../../../ai/infrastructure/providers/structured-output.service';
import { PromptingService } from '../../../../prompting/prompting.service';
import { nestApp } from '../../../core/inngest/nest-context';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';

/** What every LLM step hands to `runStructuredLlmStep`: the services, and the agent the episode belongs to. */
export async function llmStepDeps(episodeId: string) {
  const app = nestApp();
  const prisma = app.get(PrismaService);
  const episode = await prisma.deskEpisode.findUniqueOrThrow({
    where: { id: episodeId },
    select: { ownerAgentId: true },
  });
  return {
    episodeId,
    agentId: episode.ownerAgentId,
    prisma,
    prompting: app.get(PromptingService),
    structuredOutput: app.get(StructuredOutputService),
    stepWriter: app.get(DeskStepWriter),
  };
}
