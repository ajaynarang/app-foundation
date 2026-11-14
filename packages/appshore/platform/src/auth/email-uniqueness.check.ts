import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EMAIL_UNIQUE_INDEX, EMAIL_UNIQUE_INDEX_EXISTS_SQL } from '@appshore/db/email-uniqueness';
import { PrismaService } from '../infrastructure/database/prisma.service';

export const EMAIL_UNIQUENESS_UNENFORCED_EVENT = 'auth.email_uniqueness_unenforced';

/**
 * One warning at boot while the database does not enforce one live account per email.
 *
 * Migration `users_email_unique_live` skips the index when the database held duplicate accounts. Until someone merges
 * them and runs `pnpm accounts:enforce-unique-email`, a second account can still be written on a live email and login
 * may answer 409 `WORKSPACE_SELECTION_REQUIRED`. This says so once per process. It never fails the boot: a check that
 * cannot run logs at debug and moves on.
 */
@Injectable()
export class EmailUniquenessCheck implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmailUniquenessCheck.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    let present: boolean;
    try {
      const rows = await this.prisma.$queryRawUnsafe<unknown[]>(EMAIL_UNIQUE_INDEX_EXISTS_SQL, EMAIL_UNIQUE_INDEX);
      present = Array.isArray(rows) && rows.length > 0;
    } catch (err) {
      this.logger.debug(`Email uniqueness check skipped: ${(err as Error).message}`);
      return;
    }
    if (present) return;
    this.logger.warn({
      msg:
        'One live account per email is not enforced: the users_email_live_key index is absent. ' +
        'List the duplicates with pnpm accounts:duplicates, merge them, then run pnpm accounts:enforce-unique-email.',
      event: EMAIL_UNIQUENESS_UNENFORCED_EVENT,
      index: EMAIL_UNIQUE_INDEX,
    });
  }
}
