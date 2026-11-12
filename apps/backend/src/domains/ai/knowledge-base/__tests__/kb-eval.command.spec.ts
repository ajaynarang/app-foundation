const mockApp = { get: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };

jest.mock('@nestjs/core', () => ({
  NestFactory: { createApplicationContext: jest.fn(() => Promise.resolve(mockApp)) },
}));

import { NestFactory } from '@nestjs/core';
import { formatKbEval, parseKbEvalArgs, runKbEval } from '../eval/kb-eval.command';

const QUESTIONS = [
  { q: 'How do I invite a teammate?', caller: 'OWNER', expect: ['knowledge-base/workspaces/members-and-roles.md'] },
  { q: 'Where do sources show?', caller: 'MEMBER', expect: ['knowledge-base/assistant/ai-assistant.md'] },
];

describe('kb:eval command', () => {
  it('does not boot anything on import', () => {
    expect(NestFactory.createApplicationContext).not.toHaveBeenCalled();
  });

  it('asks each question under the server-side audience rule, embedding on the platform route, and scores the paths', async () => {
    const hybridSearch = jest
      .fn()
      .mockResolvedValueOnce([{ sourcePath: 'knowledge-base/workspaces/members-and-roles.md' }])
      .mockResolvedValueOnce([{ sourcePath: null }, { sourcePath: 'knowledge-base/x.md' }]);

    const report = await runKbEval({ hybridSearch }, QUESTIONS, 5);

    expect(hybridSearch).toHaveBeenCalledWith('How do I invite a teammate?', {
      audiences: ['all'],
      limit: 5,
      platformQuery: true,
    });
    expect(report).toMatchObject({ k: 5, recallAtK: 0.5, mrr: 0.5 });
    expect(report.misses.map((m) => m.q)).toEqual(['Where do sources show?']);
  });

  it('prints the date, the mode and every miss', () => {
    const text = formatKbEval({
      date: '2026-11-13',
      questions: 2,
      mode: 'full-text',
      k: 5,
      recallAtK: 0.5,
      mrr: 0.5,
      misses: [{ q: 'Where do sources show?', rank: null, got: [] }],
    });
    expect(text.split('\n')).toEqual([
      '2026-11-13 · 2 questions · full-text · recall@5 0.5 · MRR 0.5',
      '  MISS  Where do sources show?',
      '        got: (nothing)',
    ]);
  });

  it('reads --json and --report <folder>', () => {
    expect(parseKbEvalArgs([])).toEqual({ json: false, reportDir: undefined });
    expect(parseKbEvalArgs(['--json', '--report', 'docs/evals'])).toEqual({ json: true, reportDir: 'docs/evals' });
    expect(() => parseKbEvalArgs(['--report'])).toThrow('--report needs a folder');
    expect(() => parseKbEvalArgs(['--report', '--json'])).toThrow('--report needs a folder');
  });
});
