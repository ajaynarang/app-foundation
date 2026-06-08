import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { CreateFactoringContactDto } from '../dto/create-factoring-contact.dto';
import { UpdateFactoringContactDto } from '../dto/update-factoring-contact.dto';
import { nanoid } from 'nanoid';

@Injectable()
export class FactoringContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: number, factoringCompanyId: number) {
    return this.prisma.factoringContact.findMany({
      where: { factoringCompanyId, tenantId, status: 'ACTIVE' },
      orderBy: [{ isPrimary: 'desc' }, { firstName: 'asc' }],
    });
  }

  async create(tenantId: number, factoringCompanyId: number, dto: CreateFactoringContactDto) {
    const company = await this.prisma.factoringCompany.findFirst({
      where: { id: factoringCompanyId, tenantId },
    });
    if (!company) throw new NotFoundException('Factoring company not found');

    if (dto.isPrimary) {
      await this.prisma.factoringContact.updateMany({
        where: { factoringCompanyId, tenantId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return this.prisma.factoringContact.create({
      data: {
        contactId: `fc-${nanoid(12)}`,
        ...dto,
        factoringCompanyId,
        tenantId,
      },
    });
  }

  async update(tenantId: number, contactId: string, dto: UpdateFactoringContactDto) {
    const contact = await this.prisma.factoringContact.findFirst({
      where: { contactId, tenantId },
    });
    if (!contact) throw new NotFoundException('Contact not found');

    if (dto.isPrimary) {
      await this.prisma.factoringContact.updateMany({
        where: {
          factoringCompanyId: contact.factoringCompanyId,
          tenantId,
          isPrimary: true,
        },
        data: { isPrimary: false },
      });
    }

    return this.prisma.factoringContact.update({
      where: { contactId },
      data: dto,
    });
  }

  async delete(tenantId: number, contactId: string) {
    const contact = await this.prisma.factoringContact.findFirst({
      where: { contactId, tenantId },
    });
    if (!contact) throw new NotFoundException('Contact not found');

    return this.prisma.factoringContact.update({
      where: { contactId },
      data: { status: 'INACTIVE' },
    });
  }
}
