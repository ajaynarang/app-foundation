jest.mock('zod-to-json-schema', () => ({ zodToJsonSchema: jest.fn().mockReturnValue({ type: 'object' }) }));

import { z } from 'zod';
import type { Citation } from '@app/shared-types';
import { McpToolService } from '../../mcp-tool.service';
import { CITATIONS_SIDE_CHANNEL, TurnEvidence } from '../../turn-evidence';

const CITATION: Citation = { sourceType: 'KNOWLEDGE_DOCUMENT', sourceId: 'kb_1', title: 'Getting started' };
const CONTEXT = { tenantId: 7, userId: 'user_1', userDbId: 1, conversationId: 'conv_1' };

function buildService(opts: { pipelineResult?: unknown; directResult?: unknown }) {
  const provider = { search: jest.fn().mockResolvedValue(opts.directResult) };
  const registry = {
    getMcpModuleIds: () => ['mcp'],
    getTools: () => [
      {
        providerClass: Symbol('SearchTool'),
        methodName: 'search',
        metadata: { name: 'search-kb', description: 'd', parameters: z.object({}) },
      },
    ],
  };
  const moduleRef = { get: () => provider };
  const pipeline =
    opts.pipelineResult === undefined ? undefined : { run: jest.fn().mockResolvedValue(opts.pipelineResult) };
  return new McpToolService(registry as never, moduleRef as never, pipeline as never);
}

async function runSearch(service: McpToolService, evidence?: TurnEvidence): Promise<unknown> {
  const tools = await service.getToolsForPersona('member', CONTEXT, undefined, evidence);
  return (tools['search-kb'] as { execute: (args: unknown) => Promise<unknown> }).execute({ query: 'start' });
}

describe('McpToolService: the citation side channel', () => {
  it('pipeline path: moves _citations into the evidence and hides them from the model', async () => {
    const service = buildService({
      pipelineResult: {
        content: [{ type: 'text', text: JSON.stringify({ results: [], [CITATIONS_SIDE_CHANNEL]: [CITATION] }) }],
      },
    });
    const evidence = new TurnEvidence();
    const offer = jest.spyOn(evidence, 'offer');

    const result = await runSearch(service, evidence);

    expect(offer).toHaveBeenCalledWith([CITATION]);
    expect(result).toEqual({ results: [] });
  });

  it('direct path: moves _citations into the evidence and hides them from the model', async () => {
    const service = buildService({ directResult: { results: [], [CITATIONS_SIDE_CHANNEL]: [CITATION] } });
    const evidence = new TurnEvidence();
    const offer = jest.spyOn(evidence, 'offer');

    const result = await runSearch(service, evidence);

    expect(offer).toHaveBeenCalledWith([CITATION]);
    expect(result).toEqual({ results: [] });
  });

  it('strips _citations even when no evidence is collecting', async () => {
    const service = buildService({ directResult: { results: [], [CITATIONS_SIDE_CHANNEL]: [CITATION] } });

    await expect(runSearch(service)).resolves.toEqual({ results: [] });
  });

  it('passes a result without a side channel through untouched', async () => {
    const service = buildService({ directResult: { results: [{ title: 'x' }] } });
    const evidence = new TurnEvidence();
    const offer = jest.spyOn(evidence, 'offer');

    await expect(runSearch(service, evidence)).resolves.toEqual({ results: [{ title: 'x' }] });
    expect(offer).not.toHaveBeenCalled();
  });

  it('getToolsetsForPersona threads the evidence through', async () => {
    const service = buildService({ directResult: { [CITATIONS_SIDE_CHANNEL]: [CITATION] } });
    const evidence = new TurnEvidence();
    const toolsets = await service.getToolsetsForPersona('member', CONTEXT, undefined, evidence);

    await (toolsets['app-tools']['search-kb'] as { execute: (a: unknown) => Promise<unknown> }).execute({});

    expect(evidence.citedIn('Start with Getting started.')).toEqual([CITATION]);
  });
});
