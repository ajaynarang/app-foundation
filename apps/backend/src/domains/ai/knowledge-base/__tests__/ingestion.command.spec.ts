/**
 * The `pnpm seed:knowledge` entry point: it boots `IngestionCliModule` (whose graph `ingestion-cli.module.spec.ts`
 * builds for real), runs the ingest, prints a summary and always closes the context. Importing the file must not
 * start an ingest: it runs only as the main module.
 */
const mockApp = { get: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };

jest.mock('@nestjs/core', () => ({
  NestFactory: { createApplicationContext: jest.fn(() => Promise.resolve(mockApp)) },
}));
jest.mock('../ingestion-cli.module', () => ({ IngestionCliModule: class MockIngestionCliModule {} }));
jest.mock('../ingestion.service', () => ({ IngestionService: class MockIngestionService {} }));

import { NestFactory } from '@nestjs/core';
import { bootstrap, formatIngestSummary } from '../ingestion.command';
import type { IngestResult } from '../ingestion.service';
import { IngestionCliModule } from '../ingestion-cli.module';

const RESULT: IngestResult = {
  added: ['knowledge-base/a.md'],
  updated: [],
  reembedded: [],
  unchanged: 2,
  removed: ['legacy:doc_1'],
  chunkCount: 9,
  embedded: true,
};

describe('seed:knowledge command', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not boot anything on import', () => {
    expect(NestFactory.createApplicationContext).not.toHaveBeenCalled();
  });

  it('boots the CLI module, ingests, prints the summary and closes the context', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    const ingestAll = jest.fn().mockResolvedValue(RESULT);
    mockApp.get.mockReturnValue({ ingestAll });

    await expect(bootstrap(['node', 'ingestion.command.ts'])).resolves.toEqual(RESULT);

    expect(NestFactory.createApplicationContext).toHaveBeenCalledWith(IngestionCliModule, expect.anything());
    expect(ingestAll).toHaveBeenCalledWith({ force: false });
    expect(log.mock.calls[0][0]).toContain('(9 chunks written)');
    expect(mockApp.close).toHaveBeenCalled();
    log.mockRestore();
  });

  it('passes --force through, so every file is re-embedded', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    const ingestAll = jest.fn().mockResolvedValue(RESULT);
    mockApp.get.mockReturnValue({ ingestAll });

    await bootstrap(['node', 'ingestion.command.ts', '--force']);

    expect(ingestAll).toHaveBeenCalledWith({ force: true });
    log.mockRestore();
  });

  it('lists the changed files under the counts line', () => {
    expect(formatIngestSummary(RESULT).split('\n')).toEqual([
      'Knowledge base: 1 added, 0 updated, 0 re-embedded, 2 unchanged, 1 removed (9 chunks written)',
      'Added:',
      '  knowledge-base/a.md',
      'Removed:',
      '  legacy:doc_1',
      'Embeddings: written on the platform embedding route',
    ]);
  });

  it('closes the context when the ingest fails', async () => {
    mockApp.get.mockReturnValue({ ingestAll: jest.fn().mockRejectedValue(new Error('provider down')) });

    await expect(bootstrap()).rejects.toThrow('provider down');
    expect(mockApp.close).toHaveBeenCalled();
  });

  it('says when chunks were stored without vectors, and how to fix it', () => {
    expect(formatIngestSummary({ ...RESULT, embedded: false })).toContain('COHERE_API_KEY');
    expect(formatIngestSummary(RESULT)).not.toContain('COHERE_API_KEY');
  });
});
