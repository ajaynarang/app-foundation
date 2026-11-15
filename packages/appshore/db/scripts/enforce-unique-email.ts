/**
 * Create the one-live-account-per-email index, once the duplicates are merged.
 *
 *   DATABASE_URL=... pnpm accounts:enforce-unique-email
 *
 * Migration `users_email_unique_live` skips the index when the database holds two live accounts on one email. After
 * merging them (`pnpm accounts:duplicates`, then docs/operations.md, "Duplicate accounts"), run this. It refuses and
 * changes nothing while any duplicate remains, and does nothing when the index is already there. Safe to run twice.
 *
 * Exit codes: 0 enforced (created now or already), non-zero otherwise. Run directly (`npx tsx
 * scripts/enforce-unique-email.ts`), 1 means duplicates remain or the build failed and 2 means DATABASE_URL is unset;
 * through `pnpm accounts:enforce-unique-email`, pnpm reports every failure as 1.
 * The build takes a short write lock on `users`; on a large table run it in a quiet hour.
 */
import pg from 'pg';
import { enforceUniqueEmail } from '../src/email-uniqueness';

async function main(): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('accounts:enforce-unique-email: DATABASE_URL is not set. Point it at the database to change.');
    return 2;
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await enforceUniqueEmail(client);
    switch (result.status) {
      case 'already-enforced':
        console.log('One live account per email is already enforced (index users_email_live_key). Nothing to do.');
        return 0;
      case 'created':
        console.log('Created users_email_live_key: the database now refuses a second live account on one email.');
        return 0;
      case 'duplicates':
        console.error(
          `Not created: ${result.duplicateEmails} email(s) are still shared by more than one live account. ` +
            'List them with pnpm accounts:duplicates and merge them (docs/operations.md, "Duplicate accounts").',
        );
        return 1;
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      const code = (err as { code?: string }).code;
      const hint = code === '23505' ? ' A duplicate appeared while the index was built; run the report again.' : '';
      console.error(`accounts:enforce-unique-email failed: ${(err as Error).message}.${hint}`);
      process.exit(1);
    },
  );
}
