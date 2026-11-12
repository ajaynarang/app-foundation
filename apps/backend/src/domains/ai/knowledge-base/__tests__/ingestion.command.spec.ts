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
import { IngestionCliModule } from '../ingestion-cli.module';

describe('seed:knowledge command', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not boot anything on import', () => {
    expect(NestFactory.createApplicationContext).not.toHaveBeenCalled();
  });

  it('boots the CLI module, ingests, prints the summary and closes the context', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    mockApp.get.mockReturnValue({
      ingestAll: jest.fn().mockResolvedValue({ documentCount: 3, chunkCount: 9, embedded: true }),
    });

    await expect(bootstrap()).resolves.toEqual({ documentCount: 3, chunkCount: 9, embedded: true });

    expect(NestFactory.createApplicationContext).toHaveBeenCalledWith(IngestionCliModule, expect.anything());
    expect(log.mock.calls[0][0]).toContain('Chunks: 9');
    expect(mockApp.close).toHaveBeenCalled();
    log.mockRestore();
  });

  it('closes the context when the ingest fails', async () => {
    mockApp.get.mockReturnValue({ ingestAll: jest.fn().mockRejectedValue(new Error('provider down')) });

    await expect(bootstrap()).rejects.toThrow('provider down');
    expect(mockApp.close).toHaveBeenCalled();
  });

  it('says when chunks were stored without vectors, and how to fix it', () => {
    expect(formatIngestSummary({ documentCount: 1, chunkCount: 2, embedded: false })).toContain('COHERE_API_KEY');
    expect(formatIngestSummary({ documentCount: 1, chunkCount: 2, embedded: true })).not.toContain('COHERE_API_KEY');
  });
});
