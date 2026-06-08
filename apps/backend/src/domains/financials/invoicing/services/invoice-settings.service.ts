import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

@Injectable()
export class InvoiceSettingsService {
  private readonly logger = new Logger(InvoiceSettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(tenantId: number) {
    let settings = await this.prisma.invoiceSettings.findUnique({
      where: { tenantId },
    });

    if (!settings) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          companyName: true,
          dotNumber: true,
          contactEmail: true,
          contactPhone: true,
        },
      });

      settings = await this.prisma.invoiceSettings.create({
        data: {
          tenantId,
          companyLegalName: tenant?.companyName || null,
          dotNumber: tenant?.dotNumber || null,
          email: tenant?.contactEmail || null,
          phone: tenant?.contactPhone || null,
        },
      });
    }

    return this.formatResponse(settings);
  }

  async updateSettings(tenantId: number, data: Record<string, any>) {
    const settings = await this.prisma.invoiceSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        companyLegalName: data.companyLegalName,
        logoUrl: data.logoUrl,
        address: data.address,
        city: data.city,
        state: data.state,
        zip: data.zip,
        phone: data.phone,
        email: data.email,
        mcNumber: data.mcNumber,
        dotNumber: data.dotNumber,
        defaultPaymentTermsDays: data.defaultPaymentTermsDays ?? 30,
        remittanceInstructions: data.remittanceInstructions,
        acceptedPaymentMethods: data.acceptedPaymentMethods,
        defaultNotes: data.defaultNotes,
        termsAndConditions: data.termsAndConditions,
        invoicePrefix: data.invoicePrefix ?? 'INV',
        replyToEmail: data.replyToEmail,
        emailSubjectTemplate: data.emailSubjectTemplate,
        emailBodyTemplate: data.emailBodyTemplate,
      },
      update: {
        ...(data.companyLegalName !== undefined && {
          companyLegalName: data.companyLegalName,
        }),
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.zip !== undefined && { zip: data.zip }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.mcNumber !== undefined && { mcNumber: data.mcNumber }),
        ...(data.dotNumber !== undefined && { dotNumber: data.dotNumber }),
        ...(data.defaultPaymentTermsDays !== undefined && {
          defaultPaymentTermsDays: data.defaultPaymentTermsDays,
        }),
        ...(data.remittanceInstructions !== undefined && {
          remittanceInstructions: data.remittanceInstructions,
        }),
        ...(data.acceptedPaymentMethods !== undefined && {
          acceptedPaymentMethods: data.acceptedPaymentMethods,
        }),
        ...(data.defaultNotes !== undefined && {
          defaultNotes: data.defaultNotes,
        }),
        ...(data.termsAndConditions !== undefined && {
          termsAndConditions: data.termsAndConditions,
        }),
        ...(data.invoicePrefix !== undefined && {
          invoicePrefix: data.invoicePrefix,
        }),
        ...(data.replyToEmail !== undefined && {
          replyToEmail: data.replyToEmail,
        }),
        ...(data.emailSubjectTemplate !== undefined && {
          emailSubjectTemplate: data.emailSubjectTemplate,
        }),
        ...(data.emailBodyTemplate !== undefined && {
          emailBodyTemplate: data.emailBodyTemplate,
        }),
      },
    });

    this.logger.log(`Updated invoice settings for tenant ${tenantId}`);
    return this.formatResponse(settings);
  }

  private formatResponse(settings: any) {
    return {
      companyLegalName: settings.companyLegalName,
      logoUrl: settings.logoUrl,
      address: settings.address,
      city: settings.city,
      state: settings.state,
      zip: settings.zip,
      phone: settings.phone,
      email: settings.email,
      mcNumber: settings.mcNumber,
      dotNumber: settings.dotNumber,
      defaultPaymentTermsDays: settings.defaultPaymentTermsDays,
      remittanceInstructions: settings.remittanceInstructions,
      acceptedPaymentMethods: settings.acceptedPaymentMethods,
      defaultNotes: settings.defaultNotes,
      termsAndConditions: settings.termsAndConditions,
      invoicePrefix: settings.invoicePrefix,
      replyToEmail: settings.replyToEmail,
      emailSubjectTemplate: settings.emailSubjectTemplate,
      emailBodyTemplate: settings.emailBodyTemplate,
    };
  }
}
