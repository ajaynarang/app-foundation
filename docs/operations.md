# Operations

How to run a product built from this starter once it has real users. Each section is the procedure for one job.

## Duplicate accounts

The rule is one live account per email. A workspace is a membership of that one account (`WorkspaceMember`), not a
second account. Personal signup refuses a second account for a live email, and an invitation adds a membership to
the existing account.

The database holds the rule with a partial unique index, `users_email_live_key`, on `lower(email)` over the rows
that are not soft-deleted: a second live account on an address, in any case and any workspace, is refused. On a
fresh database the index is there from the first migrate.

A product that ran before this rule may still hold two or more live accounts behind one address. Then the migration
that adds the index (`users_email_unique_live`) skips it with a notice instead of failing the deploy, and the backend
logs one warning at boot while it is absent (`event: auth.email_uniqueness_unenforced`). Sign-in copes with the
duplicates in the meantime:

- The password is checked against every live account on the email. Exactly one match signs in.
- When the password matches accounts in more than one workspace, `POST /auth/login` answers 409
  `WORKSPACE_SELECTION_REQUIRED` with a `workspaces` list (`{ tenantId, name }`). The web form shows the list and
  signs in again with the chosen `tenantId`. The list is sent only after the password matched.
- On a tenant subdomain the web form sends that tenant's `tenantId` with every sign-in, and only accounts in that
  workspace count.
- Forgot-password sends one link per account, and each email names its workspace.

Merge them anyway: until every duplicate is gone, the database cannot enforce the rule, and a new duplicate can
still be written.

**List them.**

```bash
DATABASE_URL=postgresql://... pnpm accounts:duplicates          # readable list
DATABASE_URL=postgresql://... pnpm accounts:duplicates --json   # the same, as JSON
```

The report reads only. Emails compare case-insensitively and soft-deleted accounts do not count. For each shared
address it lists every account: its public user id, role, whether it is active, its workspace, how many memberships
it has, when it was created and when it last signed in.

**Merge one group.** There is no merge tool: the `User` model has about 25 relations in the foundation schema and a
product adds its own, so which rows move is the product's decision. For each address:

1. Pick the survivor, usually the account that signed in most recently or owns the most data.
2. For each other account, add its workspace to the survivor with `WorkspacesService.addMember` (same role), so the
   person keeps access to that workspace.
3. Revoke the other account's sessions (`JwtTokenService.revokeAllUserTokens(user.id)`, the numeric id).
4. Soft-delete the other account (set `deleted_at`). Its history rows stay attached to the soft-deleted row. Move
   any rows your product needs on the survivor before this step.
5. Run `pnpm accounts:duplicates` again. The address should be gone from the list.

Tell the person which workspace and password to use from now on: the survivor keeps its own password.

**Enforce the rule.** Once the report lists nothing:

```bash
DATABASE_URL=postgresql://... pnpm accounts:enforce-unique-email
```

It creates `users_email_live_key`. It refuses and changes nothing while any duplicate remains (exit 1), and does
nothing when the index is already there (exit 0), so it is safe to run twice. Building the index takes a short write
lock on `users`; on a large table run it in a quiet hour. The boot warning stops on the next deploy or restart.

To check by hand: `SELECT indexdef FROM pg_indexes WHERE indexname = 'users_email_live_key';` returns one row when
the rule is enforced.
