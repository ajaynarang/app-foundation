import * as fs from 'fs';
import * as path from 'path';

/**
 * The API and worker role switch (QUEUE_PROCESSORS_ENABLED, `@appshore/kernel` queue-processing-mode.ts) has one
 * reader: the API entry point, before the app is created. The worker never reads it, so no value of the key can stop
 * the worker; and a call after `NestFactory.create` would be too late, because @nestjs/bullmq builds its workers
 * during module init.
 */
const code = (file: string): string =>
  fs
    .readFileSync(path.join(__dirname, '..', file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('queue roles: one switch, read by the API only', () => {
  it('main.ts applies the switch before the Nest application is created', () => {
    const main = code('main.ts');
    const apply = main.indexOf('applyQueueProcessingMode()');
    const create = main.indexOf('NestFactory.create');
    expect(apply).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(-1);
    expect(apply).toBeLessThan(create);
  });

  it('worker.ts never reads the switch', () => {
    const worker = code('worker.ts');
    expect(worker).not.toMatch(/QUEUE_PROCESSORS_ENABLED|applyQueueProcessingMode|isQueueProcessingEnabled/);
    expect(worker).not.toMatch(/queue-processing-mode/);
  });
});
