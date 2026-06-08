import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';

@Injectable()
export class LoadShareLinkService {
  private readonly logger = new Logger(LoadShareLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  async issue(
    tenantId: number,
    loadDbId: number,
    issuedByUserId: number,
    input: { expiresAt?: string; recipient?: string },
  ) {
    const load = await this.prisma.load.findFirst({ where: { id: loadDbId, tenantId } });
    if (!load) throw new NotFoundException('Load not found');

    const token = nanoid(22);
    const link = await this.prisma.loadShareLink.create({
      data: {
        loadId: load.id,
        tenantId,
        token,
        recipient: input.recipient,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy: issuedByUserId,
      },
    });

    await this.events.emit(SALLY_EVENTS.LOAD_SHARE_LINK_ISSUED, tenantId, {
      loadId: load.id,
      loadNumber: load.loadNumber,
      shareLinkId: link.id,
    });

    return link;
  }

  async revoke(tenantId: number, shareLinkId: number, revokedByUserId: number) {
    const link = await this.prisma.loadShareLink.findFirst({ where: { id: shareLinkId, tenantId } });
    if (!link) throw new NotFoundException('Share link not found');
    if (link.revokedAt) return link;

    const updated = await this.prisma.loadShareLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date(), revokedBy: revokedByUserId },
    });

    await this.events.emit(SALLY_EVENTS.LOAD_SHARE_LINK_REVOKED, tenantId, {
      loadId: link.loadId,
      shareLinkId: link.id,
    });

    return updated;
  }

  async resolveActive(token: string) {
    const link = await this.prisma.loadShareLink.findUnique({ where: { token } });
    if (!link) return null;
    if (link.revokedAt) return null;
    if (link.expiresAt && link.expiresAt < new Date()) return null;

    return this.prisma.loadShareLink.update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
  }
}
