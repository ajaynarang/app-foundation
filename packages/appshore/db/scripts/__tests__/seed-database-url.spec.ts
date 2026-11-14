import { requireDatabaseUrl } from '../../prisma/seeds/utils';

/**
 * The seed writes to whatever database it is pointed at, so it must never pick one by itself: a default port can
 * belong to another project's container on the same machine. With DATABASE_URL unset it stops with a message that
 * says what to set.
 */
describe('requireDatabaseUrl', () => {
  const saved = process.env.DATABASE_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  });

  it('returns DATABASE_URL when it is set', () => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@db.internal:6000/app?schema=public';
    expect(requireDatabaseUrl()).toBe(process.env.DATABASE_URL);
  });

  it.each([undefined, '', '   '])('refuses to guess a database when DATABASE_URL is %p', (value) => {
    if (value === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = value;

    expect(() => requireDatabaseUrl()).toThrow(/DATABASE_URL is not set/);
  });
});
