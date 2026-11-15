import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';

/**
 * Shutdown must not end the pg pool twice. The pg driver adapter can end the pool it was given
 * during `$disconnect()`; a second `pool.end()` then throws "Called end on pool more than once"
 * and Nest logs the shutdown as failed. No database is needed: the pool never connects.
 */
describe('PrismaService shutdown', () => {
  function service(): PrismaService {
    const config = { get: (key: string) => (key === 'DATABASE_URL' ? 'postgresql://u:p@127.0.0.1:1/none' : undefined) };
    return new PrismaService(config as unknown as ConfigService);
  }

  function poolOf(s: PrismaService) {
    return (s as unknown as { pool: { ended: boolean; end(): Promise<void> } }).pool;
  }

  it('does not end the pool again when $disconnect already ended it', async () => {
    const s = service();
    const pool = poolOf(s);
    jest.spyOn(s, '$disconnect').mockImplementation(() => pool.end());
    await expect(s.onModuleDestroy()).resolves.toBeUndefined();
    expect(pool.ended).toBe(true);
  });

  it('ends the pool when $disconnect left it open', async () => {
    const s = service();
    const pool = poolOf(s);
    jest.spyOn(s, '$disconnect').mockResolvedValue(undefined);
    await s.onModuleDestroy();
    expect(pool.ended).toBe(true);
  });
});
