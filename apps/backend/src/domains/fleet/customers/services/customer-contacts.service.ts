import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { generateId } from '../../../../shared/utils/id-generator';

@Injectable()
export class CustomerContactsService {
  private readonly logger = new Logger(CustomerContactsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(customerId: string, tenantId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { customerId, tenantId },
    });
    if (!customer) throw new NotFoundException(`Customer not found: ${customerId}`);

    const contacts = await this.prisma.customerContact.findMany({
      where: { customerId: customer.id, status: 'ACTIVE' },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    return contacts.map((c) => this.formatResponse(c));
  }

  async create(
    customerId: string,
    tenantId: number,
    data: {
      firstName: string;
      lastName: string;
      role: string;
      email?: string;
      phone?: string;
      title?: string;
      notes?: string;
      isPrimary?: boolean;
    },
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { customerId, tenantId },
    });
    if (!customer) throw new NotFoundException(`Customer not found: ${customerId}`);

    // If no contacts exist, force this one to be primary
    const existingCount = await this.prisma.customerContact.count({
      where: { customerId: customer.id, status: 'ACTIVE' },
    });
    const isPrimary = data.isPrimary || existingCount === 0;

    const contact = await this.prisma.$transaction(async (tx) => {
      // If this contact is primary, demote existing primary
      if (isPrimary) {
        await tx.customerContact.updateMany({
          where: { customerId: customer.id, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.customerContact.create({
        data: {
          contactId: generateId('ccon'),
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email || null,
          phone: data.phone || null,
          role: data.role as any,
          isPrimary,
          title: data.title || null,
          notes: data.notes || null,
          customerId: customer.id,
          tenantId,
        },
      });
    });

    this.logger.log(`Contact created: ${contact.contactId} for customer ${customerId}`);
    return this.formatResponse(contact);
  }

  async update(
    contactId: string,
    tenantId: number,
    data: Partial<{
      firstName: string;
      lastName: string;
      role: string;
      email: string;
      phone: string;
      title: string;
      notes: string;
      isPrimary: boolean;
    }>,
    customerId?: string,
  ) {
    // Validate customer exists and belongs to tenant if customerId provided
    let customerDbId: number | undefined;
    if (customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { customerId, tenantId },
      });
      if (!customer) throw new NotFoundException(`Customer not found: ${customerId}`);
      customerDbId = customer.id;
    }

    const existing = await this.prisma.customerContact.findFirst({
      where: {
        contactId,
        tenantId,
        status: 'ACTIVE',
        ...(customerDbId ? { customerId: customerDbId } : {}),
      },
    });
    if (!existing) throw new NotFoundException(`Contact not found: ${contactId}`);

    const updated = await this.prisma.$transaction(async (tx) => {
      // If promoting to primary, demote existing primary
      if (data.isPrimary) {
        await tx.customerContact.updateMany({
          where: {
            customerId: existing.customerId,
            isPrimary: true,
            NOT: { id: existing.id },
          },
          data: { isPrimary: false },
        });
      }

      return tx.customerContact.update({
        where: { id: existing.id },
        data: {
          ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
          ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
          ...(data.role !== undefined ? { role: data.role as any } : {}),
          ...(data.email !== undefined ? { email: data.email || null } : {}),
          ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
          ...(data.title !== undefined ? { title: data.title || null } : {}),
          ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
          ...(data.isPrimary !== undefined ? { isPrimary: data.isPrimary } : {}),
        },
      });
    });

    this.logger.log(`Contact updated: ${contactId}`);
    return this.formatResponse(updated);
  }

  async remove(contactId: string, tenantId: number, customerId?: string) {
    // Validate customer exists and belongs to tenant if customerId provided
    let customerDbId: number | undefined;
    if (customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { customerId, tenantId },
      });
      if (!customer) throw new NotFoundException(`Customer not found: ${customerId}`);
      customerDbId = customer.id;
    }

    const existing = await this.prisma.customerContact.findFirst({
      where: {
        contactId,
        tenantId,
        status: 'ACTIVE',
        ...(customerDbId ? { customerId: customerDbId } : {}),
      },
    });
    if (!existing) throw new NotFoundException(`Contact not found: ${contactId}`);

    // Don't allow deleting the only contact
    const remainingCount = await this.prisma.customerContact.count({
      where: {
        customerId: existing.customerId,
        status: 'ACTIVE',
        NOT: { id: existing.id },
      },
    });

    if (remainingCount === 0) {
      throw new BadRequestException('Cannot delete the only contact. Add another contact first.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.customerContact.update({
        where: { id: existing.id },
        data: { status: 'INACTIVE' as any, isPrimary: false },
      });

      // If deleted contact was primary, promote oldest remaining
      if (existing.isPrimary) {
        const oldest = await tx.customerContact.findFirst({
          where: { customerId: existing.customerId, status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
        });
        if (oldest) {
          await tx.customerContact.update({
            where: { id: oldest.id },
            data: { isPrimary: true },
          });
        }
      }
    });

    this.logger.log(`Contact removed: ${contactId}`);
    return { contactId: contactId, message: 'Contact removed' };
  }

  private formatResponse(contact: any) {
    return {
      id: contact.id,
      contactId: contact.contactId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      role: contact.role,
      isPrimary: contact.isPrimary,
      title: contact.title,
      notes: contact.notes,
      status: contact.status,
      createdAt: contact.createdAt?.toISOString(),
      updatedAt: contact.updatedAt?.toISOString(),
    };
  }
}
