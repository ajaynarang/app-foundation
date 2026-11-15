/**
 * One live account per email, enforced by the database.
 *
 * `users` is unique only on (tenant_id, email). The rule the code assumes (personal signup refuses a second account
 * for a live email, an invitation adds a membership to the existing account) is held by a partial unique index on
 * `lower(email)` over the rows that are not soft-deleted. Prisma cannot express that index, so it lives in raw SQL:
 *
 * - Migration `users_email_unique_live` creates it when the table holds no duplicates, and otherwise skips itself
 *   with a notice, so a deploy never fails on data a product already has.
 * - `AuthModule` logs one warning at boot while it is absent (`event: auth.email_uniqueness_unenforced`).
 * - `pnpm accounts:enforce-unique-email` creates it once `pnpm accounts:duplicates` lists nothing.
 *
 * Everything that creates or drops the index holds the advisory lock `EMAIL_UNIQUE_INDEX_LOCK_KEY` while it does.
 */

/** The index name. The migration, the boot check and the enforce script all use this one. */
export const EMAIL_UNIQUE_INDEX = 'users_email_live_key';

/** Session advisory lock held while the index is created or dropped (the enforce script, and specs that drop it). */
export const EMAIL_UNIQUE_INDEX_LOCK_KEY = 4_204_117_301;

/** The index itself: case-insensitive, live rows only. A NULL email never collides. */
export const CREATE_EMAIL_UNIQUE_INDEX_SQL = `CREATE UNIQUE INDEX IF NOT EXISTS "${EMAIL_UNIQUE_INDEX}" ON "users" (lower("email")) WHERE "deleted_at" IS NULL`;

/** One row when a valid index of that name exists in the current schema. Parameter $1 is the index name. */
export const EMAIL_UNIQUE_INDEX_EXISTS_SQL = `
  SELECT 1
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = $1 AND n.nspname = current_schema() AND i.indisvalid AND i.indisunique`;

/** How many lowercased emails more than one live account shares. The same rule as the index. */
export const COUNT_DUPLICATE_EMAILS_SQL = `
  SELECT count(*)::int AS count
  FROM (
    SELECT 1
    FROM users
    WHERE deleted_at IS NULL AND email IS NOT NULL
    GROUP BY lower(email)
    HAVING count(*) > 1
  ) duplicate_emails`;

export interface EmailUniquenessQueryable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
}

export async function emailUniqueIndexExists(db: EmailUniquenessQueryable): Promise<boolean> {
  const { rows } = await db.query(EMAIL_UNIQUE_INDEX_EXISTS_SQL, [EMAIL_UNIQUE_INDEX]);
  return rows.length > 0;
}

export type EnforceUniqueEmailResult =
  | { status: 'already-enforced' }
  | { status: 'created' }
  | { status: 'duplicates'; duplicateEmails: number };

/**
 * Create the index if the table allows it. Refuses (and changes nothing) while duplicates remain. Holds the advisory
 * lock for the duration, so two runs cannot race each other.
 */
export async function enforceUniqueEmail(db: EmailUniquenessQueryable): Promise<EnforceUniqueEmailResult> {
  await db.query('SELECT pg_advisory_lock($1)', [EMAIL_UNIQUE_INDEX_LOCK_KEY]);
  try {
    if (await emailUniqueIndexExists(db)) return { status: 'already-enforced' };
    const { rows } = await db.query(COUNT_DUPLICATE_EMAILS_SQL);
    const duplicateEmails = Number(rows[0]?.count ?? 0);
    if (duplicateEmails > 0) return { status: 'duplicates', duplicateEmails };
    // A duplicate written between the count and here fails the build with unique_violation (23505); the caller
    // reports it and the operator runs the report again.
    await db.query(CREATE_EMAIL_UNIQUE_INDEX_SQL);
    return { status: 'created' };
  } finally {
    await db.query('SELECT pg_advisory_unlock($1)', [EMAIL_UNIQUE_INDEX_LOCK_KEY]);
  }
}
