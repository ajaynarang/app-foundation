/**
 * `prisma.config.ts` passes SHADOW_DATABASE_URL to Prisma as the shadow database, so
 * `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema` replays the migration history
 * in a scratch database instead of the dev one (Mastra creates tables at runtime that `migrate dev` would otherwise
 * want to reset).
 */
describe('prisma.config', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.resetModules();
  });

  const load = (): { datasource?: { url?: string; shadowDatabaseUrl?: string } } =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../prisma.config').default;

  it('reads the shadow database from SHADOW_DATABASE_URL', () => {
    process.env.SHADOW_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5499/app_shadow?schema=public';
    expect(load().datasource?.shadowDatabaseUrl).toBe(process.env.SHADOW_DATABASE_URL);
  });

  it('leaves it unset when SHADOW_DATABASE_URL is unset', () => {
    delete process.env.SHADOW_DATABASE_URL;
    expect(load().datasource?.shadowDatabaseUrl).toBeUndefined();
  });
});
