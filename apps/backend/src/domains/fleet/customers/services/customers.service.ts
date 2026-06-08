import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M } from '../../../../constants/cache.constants';
import { EmailService } from '../../../../infrastructure/notification/services/email.service';
import { generateId } from '../../../../shared/utils/id-generator';
import { CustomFieldValidatorService } from '../../custom-fields/custom-field-validator.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { CustomerType } from '@prisma/client';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly cache: SallyCacheService,
    private readonly customFieldValidator: CustomFieldValidatorService,
    private readonly events: DomainEventService,
  ) {}

  async create(data: {
    tenantId: number;
    companyName: string;
    customerType?: string;
    mcNumber?: string;
    dotNumber?: string;
    paymentTerms?: string;
    creditLimit?: number;
    taxId?: string;
    defaultBillingPath?: string;
    defaultFactoringCompanyId?: number | null;
    billingEmail?: string;
    address?: string;
    city?: string;
    state?: string;
    billingAddress?: string;
    billingCity?: string;
    billingState?: string;
    billingZip?: string;
    notes?: string;
    customFieldValues?: Record<string, any>;
  }) {
    const customerId = generateId('cust');

    // Outside carriers (we PAY them; they don't pay us) cannot have factoring
    // overrides — Sally's factor only applies to bill-to customers (Phase 1
    // overhaul: customer-type-aware factoring).
    const isCarrier = (data.customerType ?? CustomerType.SHIPPER) === CustomerType.CARRIER;
    if (isCarrier && (data.defaultBillingPath || data.defaultFactoringCompanyId)) {
      throw new BadRequestException('Outside carriers cannot have factoring overrides');
    }

    let validatedCustomFields = {};
    if (data.customFieldValues) {
      const result = await this.customFieldValidator.validate(data.tenantId, 'CUSTOMER', data.customFieldValues, {
        isCreate: true,
      });
      validatedCustomFields = result.values;
    }

    const customer = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          customerId,
          companyName: data.companyName,
          customerType: (data.customerType as any) || 'SHIPPER',
          tenantId: data.tenantId,
          mcNumber: data.mcNumber || null,
          dotNumber: data.dotNumber || null,
          paymentTerms: (data.paymentTerms || null) as any,
          creditLimit: data.creditLimit ?? null,
          taxId: data.taxId || null,
          defaultBillingPath: (data.defaultBillingPath || null) as any,
          defaultFactoringCompanyId: data.defaultFactoringCompanyId ?? null,
          billingEmail: data.billingEmail || null,
          address: data.address || null,
          city: data.city || null,
          state: data.state || null,
          billingAddress: data.billingAddress || null,
          billingCity: data.billingCity || null,
          billingState: data.billingState || null,
          billingZip: data.billingZip || null,
          notes: data.notes || null,
          customFieldValues: Object.keys(validatedCustomFields).length > 0 ? validatedCustomFields : undefined,
        },
      });

      return created;
    });

    await this.invalidateCustomerListCache(data.tenantId);
    await this.events.emit(SALLY_EVENTS.CUSTOMER_CREATED, data.tenantId, {
      entityId: customer.customerId,
      entityType: 'customer',
      customerName: customer.companyName,
    });
    this.logger.log(`Customer created: ${customerId}`);
    return this.formatResponse(customer);
  }

  async findAll(tenantId: number, includeInactive: boolean = false) {
    const cacheKey = buildKey('sally:customers', 'list', tenantId);
    const allCustomers = await this.cache.getOrSet(
      cacheKey,
      async () => {
        const customers = await this.prisma.customer.findMany({
          where: { tenantId },
          orderBy: { companyName: 'asc' },
          include: {
            users: { select: { userId: true, isActive: true } },
            invitations: {
              where: { status: 'PENDING' },
              select: { invitationId: true, email: true, status: true },
              take: 1,
            },
            contacts: {
              where: { status: 'ACTIVE' },
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            },
          },
        });
        return customers.map((c) => this.formatResponseWithAccess(c));
      },
      CACHE_TTL_WARM_5M,
    );

    if (!includeInactive) {
      return allCustomers.filter((c: any) => c.status !== 'INACTIVE');
    }
    return allCustomers;
  }

  async findOne(customerId: string, tenantId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { customerId, tenantId },
      include: {
        users: { select: { userId: true, isActive: true } },
        invitations: {
          where: { status: 'PENDING' },
          select: { invitationId: true, email: true, status: true },
          take: 1,
        },
        contacts: {
          where: { status: 'ACTIVE' },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!customer) throw new NotFoundException(`Customer not found: ${customerId}`);
    return this.formatResponseWithAccess(customer);
  }

  async update(
    customerId: string,
    data: Partial<{
      companyName: string;
      customerType: string;
      status: string;
      mcNumber: string;
      dotNumber: string;
      paymentTerms: string;
      creditLimit: number;
      taxId: string;
      defaultBillingPath: string;
      defaultFactoringCompanyId: number | null;
      billingEmail: string;
      address: string;
      city: string;
      state: string;
      billingAddress: string;
      billingCity: string;
      billingState: string;
      billingZip: string;
      notes: string;
      customFieldValues: Record<string, any>;
    }>,
    tenantId: number,
  ) {
    if (data.status === 'INACTIVE') {
      throw new BadRequestException('Cannot set status to INACTIVE directly. Use the /deactivate endpoint.');
    }

    const existing = await this.prisma.customer.findFirst({
      where: { customerId, tenantId },
    });
    if (!existing) throw new NotFoundException(`Customer not found: ${customerId}`);

    // Outside carriers cannot have factoring overrides — guard the same way as
    // create() (Phase 1 customer-type-aware factoring overhaul).
    const effectiveType = data.customerType ?? existing.customerType;
    if (effectiveType === CustomerType.CARRIER && (data.defaultBillingPath || data.defaultFactoringCompanyId)) {
      throw new BadRequestException('Outside carriers cannot have factoring overrides');
    }

    // Validate custom fields before the update
    let validatedCustomFields: Record<string, string | number | null> | undefined;
    if (data.customFieldValues !== undefined) {
      const result = await this.customFieldValidator.validate(tenantId, 'CUSTOMER', data.customFieldValues, {
        existingValues: existing.customFieldValues as any,
      });
      validatedCustomFields = result.values;
    }

    const updated = await this.prisma.customer.update({
      where: { id: existing.id },
      include: {
        contacts: {
          where: { status: 'ACTIVE' },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
      data: {
        ...(data.companyName !== undefined ? { companyName: data.companyName } : {}),
        ...(data.customerType !== undefined ? { customerType: data.customerType as any } : {}),
        ...(data.status !== undefined ? { status: data.status as any } : {}),
        ...(data.mcNumber !== undefined ? { mcNumber: data.mcNumber || null } : {}),
        ...(data.dotNumber !== undefined ? { dotNumber: data.dotNumber || null } : {}),
        ...(data.paymentTerms !== undefined ? { paymentTerms: (data.paymentTerms || null) as any } : {}),
        ...(data.creditLimit !== undefined ? { creditLimit: data.creditLimit } : {}),
        ...(data.taxId !== undefined ? { taxId: data.taxId || null } : {}),
        ...(data.defaultBillingPath !== undefined
          ? { defaultBillingPath: (data.defaultBillingPath || null) as any }
          : {}),
        ...(data.defaultFactoringCompanyId !== undefined
          ? {
              defaultFactoringCompanyId: data.defaultFactoringCompanyId ?? null,
            }
          : {}),
        ...(data.billingEmail !== undefined ? { billingEmail: data.billingEmail || null } : {}),
        ...(data.address !== undefined ? { address: data.address || null } : {}),
        ...(data.city !== undefined ? { city: data.city || null } : {}),
        ...(data.state !== undefined ? { state: data.state || null } : {}),
        ...(data.billingAddress !== undefined ? { billingAddress: data.billingAddress || null } : {}),
        ...(data.billingCity !== undefined ? { billingCity: data.billingCity || null } : {}),
        ...(data.billingState !== undefined ? { billingState: data.billingState || null } : {}),
        ...(data.billingZip !== undefined ? { billingZip: data.billingZip || null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
        ...(validatedCustomFields !== undefined ? { customFieldValues: validatedCustomFields } : {}),
      },
    });
    await this.invalidateCustomerListCache(tenantId);
    await this.events.emit(SALLY_EVENTS.CUSTOMER_UPDATED, tenantId, {
      entityId: updated.customerId,
      entityType: 'customer',
      customerName: updated.companyName,
      changedFields: Object.keys(data),
    });
    this.logger.log(`Customer updated: ${customerId}`);
    return this.formatResponse(updated);
  }

  async inviteContact(
    customerId: string,
    data: {
      email: string;
      firstName: string;
      lastName: string;
      tenantId: number;
      invitedBy: string;
    },
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { customerId, tenantId: data.tenantId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer not found: ${customerId}`);
    }

    // Validate email matches an existing contact for this customer
    const contact = await this.prisma.customerContact.findFirst({
      where: {
        customerId: customer.id,
        email: { equals: data.email, mode: 'insensitive' },
        status: 'ACTIVE',
      },
    });
    if (!contact) {
      throw new BadRequestException('Email must match an existing contact for this customer. Add the contact first.');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { email: data.email, tenantId: data.tenantId },
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const existingInvitation = await this.prisma.userInvitation.findFirst({
      where: { email: data.email, tenantId: data.tenantId, status: 'PENDING' },
    });
    if (existingInvitation) {
      throw new ConflictException('Invitation already sent to this email');
    }

    const invitingUser = await this.prisma.user.findUnique({
      where: { userId: data.invitedBy },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!invitingUser) {
      throw new NotFoundException('Inviting user not found');
    }

    const { customAlphabet } = await import('nanoid');
    const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 32);
    const token = nanoid();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.userInvitation.create({
      data: {
        invitationId: generateId('inv'),
        tenant: { connect: { id: data.tenantId } },
        invitedByUser: { connect: { id: invitingUser.id } },
        customer: { connect: { id: customer.id } },
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: 'CUSTOMER',
        token,
        status: 'PENDING',
        expiresAt,
      },
    });

    // Send invitation email
    const invitedByName = invitingUser.firstName ? `${invitingUser.firstName} ${invitingUser.lastName}` : 'Your team';

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: data.tenantId },
      select: { companyName: true },
    });

    try {
      await this.emailService.sendUserInvitation(
        data.email,
        data.firstName,
        data.lastName,
        invitedByName,
        tenant?.companyName || 'Your company',
        token,
      );
      this.logger.log(`Invitation email sent to ${data.email}`);
    } catch (emailError) {
      this.logger.error(`Failed to send invitation email to ${data.email}`, emailError);
      // Don't throw — invitation is created; email failure is non-blocking
    }

    this.logger.log(`Customer invitation created for ${data.email} -> customer ${customerId}`);

    const appUrl = this.configService.get<string>('APP_URL') || 'http://localhost:3000';
    const inviteLink = `${appUrl}/accept-invitation?token=${token}`;

    return {
      invitationId: invitation.invitationId,
      email: invitation.email,
      status: invitation.status,
      customerId: customerId,
      expiresAt: invitation.expiresAt.toISOString(),
      inviteLink,
    };
  }

  async deactivate(customerId: string, tenantId: number, userId: number, reason: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { customerId, tenantId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.status === 'INACTIVE') throw new BadRequestException('Customer is already inactive');

    // Safety check: active loads
    const activeLoads = await this.prisma.load.findMany({
      where: {
        customerId: customer.id,
        status: { in: ['ASSIGNED', 'IN_TRANSIT', 'ON_HOLD'] },
        isActive: true,
      },
      select: { loadNumber: true, status: true },
    });

    if (activeLoads.length > 0) {
      throw new ConflictException({
        message: `Cannot deactivate customer. Customer has ${activeLoads.length} active load(s) that must be completed or reassigned first.`,
        activeLoads: activeLoads.map((l) => ({
          loadNumber: l.loadNumber,
          status: l.status,
        })),
      });
    }

    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        status: 'INACTIVE',
        deactivatedAt: new Date(),
        deactivatedBy: userId,
        deactivationReason: reason,
      },
      include: { contacts: { where: { status: 'ACTIVE' } } },
    });

    await this.invalidateCustomerListCache(tenantId);
    return this.formatResponse(updated);
  }

  async reactivate(customerId: string, tenantId: number, userId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { customerId, tenantId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.status !== 'INACTIVE') throw new BadRequestException('Customer is not inactive');

    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        status: 'ACTIVE',
        reactivatedAt: new Date(),
        reactivatedBy: userId,
        deactivatedAt: null,
        deactivatedBy: null,
        deactivationReason: null,
      },
      include: { contacts: { where: { status: 'ACTIVE' } } },
    });

    await this.invalidateCustomerListCache(tenantId);
    return this.formatResponse(updated);
  }

  /** Invalidate customer list caches for a tenant. */
  private async invalidateCustomerListCache(tenantId: number): Promise<void> {
    await this.cache.del(buildKey('sally:customers', 'list', tenantId));
  }

  private formatResponse(customer: any) {
    // Derive primary contact from the contacts relation when available
    const _primaryContact = customer.contacts?.find((c: any) => c.isPrimary) ?? customer.contacts?.[0] ?? null;

    return {
      id: customer.id,
      customerId: customer.customerId,
      companyName: customer.companyName,
      customerType: customer.customerType,
      status: customer.status,
      mcNumber: customer.mcNumber,
      dotNumber: customer.dotNumber,
      paymentTerms: customer.paymentTerms,
      creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null,
      taxId: customer.taxId,
      defaultBillingPath: customer.defaultBillingPath || null,
      defaultFactoringCompanyId: customer.defaultFactoringCompanyId || null,
      billingEmail: customer.billingEmail,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      billingAddress: customer.billingAddress,
      billingCity: customer.billingCity,
      billingState: customer.billingState,
      billingZip: customer.billingZip,
      notes: customer.notes,
      deactivatedAt: customer.deactivatedAt?.toISOString() || null,
      deactivatedBy: customer.deactivatedBy || null,
      deactivationReason: customer.deactivationReason || null,
      reactivatedAt: customer.reactivatedAt?.toISOString() || null,
      reactivatedBy: customer.reactivatedBy || null,
      createdAt: customer.createdAt?.toISOString(),
      updatedAt: customer.updatedAt?.toISOString(),
    };
  }

  private formatResponseWithAccess(customer: any) {
    let portalAccessStatus: string = 'NO_ACCESS';
    if (customer.users?.length > 0) {
      portalAccessStatus = customer.users.some((u: any) => u.isActive) ? 'ACTIVE' : 'DEACTIVATED';
    } else if (customer.invitations?.length > 0) {
      portalAccessStatus = 'INVITED';
    }

    const contacts = (customer.contacts || []).map((c: any) => ({
      id: c.id,
      contactId: c.contactId,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      role: c.role,
      isPrimary: c.isPrimary,
      title: c.title,
      notes: c.notes,
      status: c.status,
    }));

    return {
      ...this.formatResponse(customer),
      portalAccessStatus,
      pendingInvitationId: customer.invitations?.[0]?.invitationId || null,
      contacts,
      contactsCount: contacts.length,
    };
  }
}
