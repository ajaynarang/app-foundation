import { Injectable, NotFoundException } from '@nestjs/common';
import { OutboundAllowKind, Prisma } from '@appshore/db';
import type { OutboundAllowEntry, OutboundStatus, OutboundSuppressionList } from '@app/shared-types';
import { duplicate, fieldError, invalidState } from '@appshore/kernel/shared/errors/api-errors';
import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';
import { resolveObservabilityEnv } from '@appshore/kernel/shared/utils/env-label';
import { normalizeAllowValue } from '@appshore/kernel/infrastructure/outbound/outbound-recipient';
import {
  buildCursorPage,
  clampCursorLimit,
  encodeCursor,
  keysetWhere,
} from '@appshore/kernel/shared/utils/cursor-pagination';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { OutboundPolicyService } from '../../infrastructure/outbound/outbound-policy.service';
import type { CreateOutboundAllowEntryDto } from './dto/create-outbound-allow-entry.dto';
import type { ListOutboundSuppressionsQueryDto } from './dto/list-outbound-suppressions.query.dto';
import {
  ALLOW_ENTRY_SELECT,
  SUPPRESSION_SELECT,
  toOutboundAllowEntry,
  toOutboundSuppression,
} from './outbound.serializer';

/** A super-admin keeps this list by hand; the cap keeps the read bounded (BOUNDED_LISTS in the API contract). */
export const OUTBOUND_ALLOW_LIST_CAP = 500;

const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const DOMAIN_PATTERN = /^([a-z0-9-]+\.)+[a-z]{2,}$/;
const PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;

/** Allowing a whole public mail domain would let a test environment email any of its users. */
const SHARED_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.in',
  'rediffmail.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
  'zoho.com',
]);

const VALUE_RULES: Record<OutboundAllowKind, { pattern: RegExp; message: string }> = {
  [OutboundAllowKind.EMAIL]: { pattern: EMAIL_PATTERN, message: 'Enter a full email address, e.g. qa@example.com' },
  [OutboundAllowKind.EMAIL_DOMAIN]: { pattern: DOMAIN_PATTERN, message: 'Enter an email domain, e.g. example.com' },
  [OutboundAllowKind.PHONE]: {
    pattern: PHONE_PATTERN,
    message: 'Enter a phone number with its country code, e.g. +919812345678',
  },
  [OutboundAllowKind.HOST]: { pattern: DOMAIN_PATTERN, message: 'Enter a web host, e.g. hooks.example.com' },
};

const SUPPRESSION_KEYSET = { field: 'createdAt', idField: 'id', kind: 'date', direction: 'desc' } as const;

/** Super-admin management of the outbound allow-list and the held-back list (ADR "Outbound gate"). */
@Injectable()
export class OutboundAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbound: OutboundPolicyService,
  ) {}

  getStatus(): OutboundStatus {
    return {
      mode: this.outbound.getMode(),
      isLive: this.outbound.isLive(),
      environment: resolveObservabilityEnv(process.env.ENV_TYPE),
      bootstrapEntries: this.outbound.bootstrapCount(),
    };
  }

  async listEntries(): Promise<OutboundAllowEntry[]> {
    const rows = await this.prisma.outboundAllowEntry.findMany({
      select: ALLOW_ENTRY_SELECT,
      orderBy: [{ kind: 'asc' }, { value: 'asc' }],
      take: OUTBOUND_ALLOW_LIST_CAP,
    });
    return rows.map(toOutboundAllowEntry);
  }

  async createEntry(dto: CreateOutboundAllowEntryDto, createdById: number): Promise<OutboundAllowEntry> {
    if (this.outbound.isLive()) {
      throw invalidState('This environment sends to everyone (live mode), so the allow-list is not used here.');
    }

    const value = normalizeAllowValue(dto.kind, dto.value);
    const rule = VALUE_RULES[dto.kind];
    if (!rule.pattern.test(value)) throw fieldError('value', rule.message);
    if (dto.kind === OutboundAllowKind.EMAIL_DOMAIN && SHARED_MAIL_DOMAINS.has(value)) {
      throw fieldError('value', `${value} is a public mail domain: add the exact email address instead.`);
    }

    try {
      const row = await this.prisma.outboundAllowEntry.create({
        data: { id: generateUuidV7(), kind: dto.kind, value, note: dto.note?.trim() || null, createdById },
        select: ALLOW_ENTRY_SELECT,
      });
      this.outbound.invalidate();
      return toOutboundAllowEntry(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw duplicate(`${value} is already on the allow-list`);
      }
      throw error;
    }
  }

  async deleteEntry(entryId: string): Promise<void> {
    const { count } = await this.prisma.outboundAllowEntry.deleteMany({ where: { id: entryId } });
    if (count === 0) throw new NotFoundException('Allow-list entry not found');
    this.outbound.invalidate();
  }

  async listSuppressions(query: ListOutboundSuppressionsQueryDto): Promise<OutboundSuppressionList> {
    const take = clampCursorLimit(query.limit);
    // Decoded before any query runs: a malformed cursor is a 400 and costs nothing.
    const keyset = query.cursor ? keysetWhere({ ...SUPPRESSION_KEYSET, cursor: query.cursor }) : undefined;

    const [rows, total] = await Promise.all([
      this.prisma.outboundSuppression.findMany({
        where: keyset,
        select: SUPPRESSION_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
      }),
      this.prisma.outboundSuppression.count(),
    ]);

    const page = buildCursorPage(rows, take, (row) => encodeCursor(row.createdAt, row.id));
    return { items: page.items.map(toOutboundSuppression), nextCursor: page.nextCursor, total };
  }
}
