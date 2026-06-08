import {
  Controller,
  Logger,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  NotFoundException,
  ParseIntPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { InvoicingService } from '../services/invoicing.service';
import { PaymentsService } from '../../payments/services/payments.service';
import { InvoiceSettingsService } from '../services/invoice-settings.service';
import { InvoicePdfService } from '../services/invoice-pdf.service';
import { InvoiceEmailService } from '../services/invoice-email.service';
import { InvoiceShareService } from '../services/invoice-share.service';
import { FactoringService } from '../services/factoring.service';
import { FactoringContactsService } from '../services/factoring-contacts.service';
import { NoaService } from '../services/noa.service';
import { DocBundleService } from '../services/doc-bundle.service';
import {
  CreateInvoiceDto,
  RecordPaymentDto,
  UpdateInvoiceDto,
  UpdateInvoiceSettingsDto,
  BatchGenerateDto,
  BatchActionDto,
  BatchMarkPaidDto,
  CreateFactoringCompanyDto,
  UpdateFactoringCompanyDto,
  CreateNoaRecordDto,
  UpdateNoaStatusDto,
  SubmitToFactorDto,
  CreateFactoringContactDto,
  UpdateFactoringContactDto,
  RecordFactoringTransactionDto,
} from '../dto';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicingController extends BaseTenantController {
  private readonly logger = new Logger(InvoicingController.name);

  constructor(
    prisma: PrismaService,
    private readonly invoicingService: InvoicingService,
    private readonly paymentsService: PaymentsService,
    private readonly invoiceSettingsService: InvoiceSettingsService,
    private readonly invoicePdfService: InvoicePdfService,
    private readonly invoiceEmailService: InvoiceEmailService,
    private readonly invoiceShareService: InvoiceShareService,
    private readonly factoringService: FactoringService,
    private readonly factoringContactsService: FactoringContactsService,
    private readonly noaService: NoaService,
    private readonly docBundleService: DocBundleService,
  ) {
    super(prisma);
  }

  @Post('generate/:load_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Auto-generate invoice from delivered load' })
  async generateFromLoad(
    @CurrentUser() user: any,
    @Param('load_id') loadId: string,
    @Body()
    body: {
      paymentTermsDays?: number;
      notes?: string;
      internalNotes?: string;
    },
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoicingService.generateFromLoad(tenantDbId, loadId, body);
  }

  @Post()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create invoice with manual line items' })
  async create(@CurrentUser() user: any, @Body() dto: CreateInvoiceDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoicingService.generateFromLoad(tenantDbId, dto.loadId, {
      paymentTermsDays: dto.paymentTermsDays,
      notes: dto.notes,
      internalNotes: dto.internalNotes,
    });
  }

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List invoices with filtering' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'overdueOnly', required: false })
  @ApiQuery({ name: 'minDaysOverdue', required: false, description: 'Narrow to invoices past due by at least N days' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'billingPath', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async findAll(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('overdueOnly') overdueOnly?: string,
    @Query('minDaysOverdue') minDaysOverdue?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('billingPath') billingPath?: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoicingService.findAll(
      tenantDbId,
      {
        status,
        customerId: customerId ? Number(customerId) : undefined,
        overdueOnly: overdueOnly === 'true',
        minDaysOverdue:
          minDaysOverdue !== undefined && !Number.isNaN(Number(minDaysOverdue)) ? Number(minDaysOverdue) : undefined,
        search,
        sortBy,
        sortOrder,
        dateFrom,
        dateTo,
        billingPath,
      },
      { limit: Number(limit), offset: Number(offset) },
    );
  }

  @Get('settings')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get invoice settings' })
  async getSettings(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoiceSettingsService.getSettings(tenantDbId);
  }

  @Patch('settings')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update invoice settings' })
  async updateSettings(@CurrentUser() user: any, @Body() dto: UpdateInvoiceSettingsDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoiceSettingsService.updateSettings(tenantDbId, dto);
  }

  @Get('summary')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'AR summary with aging buckets' })
  async getSummary(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoicingService.getSummary(tenantDbId);
  }

  // Batch operations
  @Post('batch/generate')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Batch generate invoices from loads' })
  async batchGenerate(@CurrentUser() user: any, @Body() dto: BatchGenerateDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoicingService.batchGenerate(tenantDbId, dto.loadIds, {
      paymentTermsDays: dto.paymentTermsDays,
    });
  }

  @Post('batch/send')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Batch send invoices' })
  async batchSend(@CurrentUser() user: any, @Body() dto: BatchActionDto & { sendEmail?: boolean }) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoicingService.batchSend(tenantDbId, dto.invoiceIds);
  }

  @Post('batch/void')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Batch void invoices' })
  async batchVoid(@CurrentUser() user: any, @Body() dto: BatchActionDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoicingService.batchVoid(tenantDbId, dto.invoiceIds);
  }

  @Post('batch/mark-paid')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Batch mark invoices as paid' })
  async batchMarkPaid(@CurrentUser() user: any, @Body() dto: BatchMarkPaidDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoicingService.batchMarkPaid(tenantDbId, dto.invoiceIds, {
      paymentDate: dto.paymentDate,
      paymentMethod: dto.paymentMethod,
    });
  }

  @Post('batch/download')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Batch download invoices as ZIP' })
  async batchDownload(@CurrentUser() user: any, @Body() dto: BatchActionDto, @Res() res: Response) {
    const tenantDbId = await this.getTenantDbId(user);
    const archiver = (await import('archiver')).default;
    const archive = archiver('zip', { zlib: { level: 9 } });

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="invoices-${Date.now()}.zip"`,
    });

    archive.pipe(res);

    for (const invoiceNumber of dto.invoiceIds) {
      try {
        const buffer = await this.invoicePdfService.generatePdf(tenantDbId, invoiceNumber);
        const invoice = await this.invoicingService.findOne(tenantDbId, invoiceNumber);
        archive.append(buffer, {
          name: `${invoice.invoiceNumber}.pdf`,
        });
      } catch (error) {
        this.logger.warn(`Failed to generate PDF for invoice ${invoiceNumber}: ${error}`);
      }
    }

    await archive.finalize();
  }

  // NOA records
  @Get('noa-records')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List NOA records' })
  @ApiQuery({ name: 'customerId', required: false })
  async listNoaRecords(@CurrentUser() user: any, @Query('customerId') customerId?: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.noaService.listNoaRecords(tenantDbId, customerId ? Number(customerId) : undefined);
  }

  @Post('noa-records')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create NOA record' })
  async createNoaRecord(@CurrentUser() user: any, @Body() dto: CreateNoaRecordDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.noaService.createNoaRecord(tenantDbId, dto);
  }

  @Patch('noa-records/:noa_id/status')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update NOA record status' })
  async updateNoaStatus(@CurrentUser() user: any, @Param('noa_id') noaId: string, @Body() dto: UpdateNoaStatusDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.noaService.updateNoaStatus(tenantDbId, noaId, dto);
  }

  @Delete('noa-records/:noa_id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Delete NOA record' })
  async deleteNoaRecord(@CurrentUser() user: any, @Param('noa_id') noaId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.noaService.deleteNoaRecord(tenantDbId, noaId);
  }

  @Get('noa-records/inbox')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List NOAs for the dispatcher inbox view (filterable)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'factorId', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'ageBucket', required: false, enum: ['all', 'pending_gt_14', 'rejected'] })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async listNoaInbox(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('factorId') factorId?: string,
    @Query('customerId') customerId?: string,
    @Query('ageBucket') ageBucket?: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.noaService.listNoaInbox(tenantDbId, {
      status: status as any,
      factorId: factorId ? Number(factorId) : undefined,
      customerId: customerId ? Number(customerId) : undefined,
      ageBucket: ageBucket as 'all' | 'pending_gt_14' | 'rejected' | undefined,
      limit: Number(limit),
      offset: Number(offset),
    });
  }

  @Post('noa-records/:noa_id/send')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Email the NOA letter to the broker' })
  async sendNoa(@CurrentUser() user: any, @Param('noa_id') noaId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.noaService.sendNoaEmail(tenantDbId, noaId);
  }

  @Post('noa-records/bulk-for-factor-change')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Bulk-create NOT_SENT NOAs for every customer with recent FACTORED invoices when the factor changes',
  })
  async bulkCreateForFactorChange(@CurrentUser() user: any, @Body() body: { newFactoringCompanyId: number }) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.noaService.bulkCreateForFactorChange(tenantDbId, body.newFactoringCompanyId);
  }

  // Factoring company CRUD
  @Get('factoring-companies')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List factoring companies' })
  async listFactoringCompanies(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.factoringService.listCompanies(tenantDbId);
  }

  @Post('factoring-companies')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create factoring company' })
  async createFactoringCompany(@CurrentUser() user: any, @Body() dto: CreateFactoringCompanyDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.factoringService.createCompany(tenantDbId, dto);
  }

  @Patch('factoring-companies/:company_id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update factoring company' })
  async updateFactoringCompany(
    @CurrentUser() user: any,
    @Param('company_id') companyId: string,
    @Body() dto: UpdateFactoringCompanyDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.factoringService.updateCompany(tenantDbId, companyId, dto);
  }

  @Delete('factoring-companies/:company_id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Delete factoring company' })
  async deleteFactoringCompany(@CurrentUser() user: any, @Param('company_id') companyId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.factoringService.deleteCompany(tenantDbId, companyId);
  }

  // Factoring contacts
  @Get('factoring-companies/:companyId/contacts')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List contacts for a factoring company' })
  async listFactoringContacts(@CurrentUser() user: any, @Param('companyId', ParseIntPipe) companyId: number) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.factoringContactsService.list(tenantDbId, companyId);
  }

  @Post('factoring-companies/:companyId/contacts')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create a factoring contact' })
  async createFactoringContact(
    @CurrentUser() user: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() body: CreateFactoringContactDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.factoringContactsService.create(tenantDbId, companyId, body);
  }

  @Patch('factoring-contacts/:contactId')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update a factoring contact' })
  async updateFactoringContact(
    @CurrentUser() user: any,
    @Param('contactId') contactId: string,
    @Body() body: UpdateFactoringContactDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.factoringContactsService.update(tenantDbId, contactId, body);
  }

  @Delete('factoring-contacts/:contactId')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Delete a factoring contact' })
  async deleteFactoringContact(@CurrentUser() user: any, @Param('contactId') contactId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.factoringContactsService.delete(tenantDbId, contactId);
  }

  // Batch submit to factor (new flow)
  @Post('batch/submit-to-factor')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Batch submit invoices to factoring company' })
  async batchSubmitToFactor(
    @CurrentUser() user: any,
    @Body()
    body: {
      invoiceIds: string[];
      factoringCompanyId: string;
      factoringReference?: string;
      sendEmail?: boolean;
    },
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.factoringService.batchSubmitToFactor(tenantDbId, body.invoiceIds, {
      factoringCompanyId: body.factoringCompanyId,
      factoringReference: body.factoringReference,
      sendEmail: body.sendEmail,
    });
  }

  @Get('customers/:customer_id/payment-stats')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get customer payment statistics' })
  async getCustomerPaymentStats(@CurrentUser() user: any, @Param('customer_id') customerId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const customer = await this.prisma.customer.findFirst({
      where: { customerId, tenantId: tenantDbId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.invoicingService.getCustomerPaymentStats(tenantDbId, customer.id);
  }

  @Get(':invoice_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get invoice detail with line items and payments' })
  async findOne(@CurrentUser() user: any, @Param('invoice_id') invoiceNumber: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoicingService.findOne(tenantDbId, invoiceNumber);
  }

  @Patch(':invoice_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update draft invoice' })
  async update(@CurrentUser() user: any, @Param('invoice_id') invoiceNumber: string, @Body() dto: UpdateInvoiceDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoicingService.update(tenantDbId, invoiceNumber, dto);
  }

  @Post(':invoice_id/send')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Mark invoice as sent' })
  async markSent(
    @CurrentUser() user: any,
    @Param('invoice_id') invoiceNumber: string,
    @Body() body: { sendEmail?: boolean },
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    const result = await this.invoicingService.markSent(tenantDbId, invoiceNumber);
    if (body?.sendEmail) {
      await this.invoiceEmailService.sendInvoice(tenantDbId, invoiceNumber);
    }
    return result;
  }

  @Post(':invoice_id/void')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Void an invoice' })
  async voidInvoice(@CurrentUser() user: any, @Param('invoice_id') invoiceNumber: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoicingService.voidInvoice(tenantDbId, invoiceNumber);
  }

  @Post(':invoice_id/payments')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Record payment against invoice' })
  async recordPayment(
    @CurrentUser() user: any,
    @Param('invoice_id') invoiceNumber: string,
    @Body() dto: RecordPaymentDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.paymentsService.recordPayment(tenantDbId, invoiceNumber, dto, user.dbId);
  }

  @Post(':invoice_id/resend')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Resend invoice email' })
  async resendInvoice(@CurrentUser() user: any, @Param('invoice_id') invoiceNumber: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoiceEmailService.sendInvoice(tenantDbId, invoiceNumber);
  }

  @Post(':invoice_id/share')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create shareable invoice link' })
  async createShareLink(@CurrentUser() user: any, @Param('invoice_id') invoiceNumber: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoiceShareService.createShareLink(tenantDbId, invoiceNumber);
  }

  @Post(':invoice_id/reinvoice')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Re-invoice from voided invoice' })
  async reInvoice(@CurrentUser() user: any, @Param('invoice_id') invoiceNumber: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoicingService.reInvoice(tenantDbId, invoiceNumber);
  }

  @Post(':invoice_id/submit-to-factor')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Submit invoice to factoring company' })
  async submitToFactor(
    @CurrentUser() user: any,
    @Param('invoice_id') invoiceNumber: string,
    @Body() dto: SubmitToFactorDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.factoringService.submitToFactor(tenantDbId, invoiceNumber, dto);
  }

  // ─── Phase 4 — factoring money ledger ────────────────────────────────

  @Post(':invoice_id/factoring-transactions')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Record a factoring transaction (advance/fee/reserve/chargeback/reversal)' })
  async recordFactoringTransaction(
    @CurrentUser() user: any,
    @Param('invoice_id') invoiceNumber: string,
    @Body() dto: RecordFactoringTransactionDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    const userId = (user.userDbId ?? user.userId ?? null) as number | null;

    switch (dto.type) {
      case 'ADVANCE':
        return this.factoringService.recordAdvance(tenantDbId, invoiceNumber, userId, {
          ...dto,
          type: 'ADVANCE',
        });
      case 'FEE':
        return this.factoringService.recordFee(tenantDbId, invoiceNumber, userId, { ...dto, type: 'FEE' });
      case 'RESERVE_RELEASE':
        return this.factoringService.recordReserveRelease(tenantDbId, invoiceNumber, userId, {
          ...dto,
          type: 'RESERVE_RELEASE',
        });
      case 'CHARGEBACK':
        return this.factoringService.recordChargeback(tenantDbId, invoiceNumber, userId, {
          ...dto,
          type: 'CHARGEBACK',
        });
      case 'CHARGEBACK_REVERSAL':
        return this.factoringService.recordChargebackReversal(tenantDbId, invoiceNumber, userId, {
          ...dto,
          type: 'CHARGEBACK_REVERSAL',
        });
      default: {
        // Exhaustive switch — TypeScript ensures all union members handled.
        const _exhaustive: never = dto.type;
        throw new NotFoundException(`Unknown transaction type: ${_exhaustive}`);
      }
    }
  }

  @Get(':invoice_id/factoring-transactions')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List active factoring transactions for an invoice' })
  async listFactoringTransactions(@CurrentUser() user: any, @Param('invoice_id') invoiceNumber: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.factoringService.listFactoringTransactions(tenantDbId, invoiceNumber);
  }

  @Delete('factoring-transactions/:transaction_id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Soft-delete a factoring transaction (audit-preserving)' })
  async deleteFactoringTransaction(@CurrentUser() user: any, @Param('transaction_id') transactionId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const userId = (user.userDbId ?? user.userId ?? null) as number | null;
    return this.factoringService.deleteFactoringTransaction(tenantDbId, transactionId, userId);
  }

  @Get('factoring-transactions/summary')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Factoring dashboard summary (Phase 4C aggregations)' })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD start of date range' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD end of date range' })
  async getFactoringSummary(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.factoringService.getFactoringSummary(tenantDbId, { from, to });
  }

  @Get('factoring-transactions/backfill-status')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Count of backfill-estimated transactions awaiting verification (Phase 4C)' })
  async getFactoringBackfillStatus(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.factoringService.getBackfillBannerStatus(tenantDbId);
  }

  @Get(':invoice_id/noa-status')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get NOA status for the (customer, factor) pair on an invoice' })
  async getNoaStatusForInvoice(@CurrentUser() user: any, @Param('invoice_id') invoiceNumber: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const invoice = await this.prisma.invoice.findFirst({
      where: { invoiceNumber, tenantId: tenantDbId },
      include: { customer: { select: { id: true, companyName: true, customerId: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!invoice.factoringCompanyId) {
      return { noa: null, customer: invoice.customer, factoringCompanyId: null };
    }
    const noa = await this.noaService.checkNoaForInvoice(tenantDbId, invoice.customerId, invoice.factoringCompanyId);
    return {
      noa: noa
        ? { id: noa.id, noaId: noa.noaId, status: noa.status, sentAt: noa.sentAt, acknowledgedAt: noa.acknowledgedAt }
        : null,
      customer: invoice.customer,
      factoringCompanyId: invoice.factoringCompanyId,
    };
  }

  @Get(':invoice_id/doc-bundle')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get document bundle status for an invoice' })
  async getDocBundle(@CurrentUser() user: any, @Param('invoice_id') invoiceNumber: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const [{ documents, loadId, invoiceNumber: resolvedInvoiceNumber }, bundleStatus] = await Promise.all([
      this.docBundleService.getDocumentList(tenantDbId, invoiceNumber),
      this.docBundleService.validateBundleReady(tenantDbId, invoiceNumber),
    ]);

    const TYPE_LABEL = {
      INVOICE: 'Invoice',
      RATE_CON: 'Rate Confirmation',
      BOL: 'Bill of Lading',
      POD: 'Proof of Delivery',
    } as const;

    const presentTypes = new Set(documents.filter((d: any) => !!d.s3Key).map((d: any) => d.documentType));

    const docs = (['INVOICE', 'RATE_CON', 'BOL', 'POD'] as const).map((type) => {
      const available = type === 'INVOICE' ? true : presentTypes.has(type);
      return {
        type,
        label: TYPE_LABEL[type],
        available,
        uploadUrl:
          type !== 'INVOICE' && !available
            ? `/dispatcher/loads?open=${encodeURIComponent(String(loadId))}&tab=docs`
            : undefined,
      };
    });

    return {
      invoiceNumber: resolvedInvoiceNumber,
      loadId,
      ready: bundleStatus.ready,
      docs,
      missing: bundleStatus.missing,
    };
  }

  @Get(':invoice_id/doc-bundle/download')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Download invoice document bundle (ZIP or merged PDF, per tenant.bundleFormat)' })
  async downloadDocBundle(@CurrentUser() user: any, @Param('invoice_id') invoiceNumber: string, @Res() res: Response) {
    const tenantDbId = await this.getTenantDbId(user);
    const bundle = await this.docBundleService.generateBundle(tenantDbId, invoiceNumber);

    res.set({
      'Content-Type': bundle.contentType,
      'Content-Disposition': `attachment; filename="${bundle.fileName}"`,
      'Content-Length': bundle.buffer.length.toString(),
    });
    res.end(bundle.buffer);
  }

  @Get(':invoice_id/bundle-preview')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Stream the factoring bundle (ZIP or merged PDF) for the preview button' })
  async previewBundle(@CurrentUser() user: any, @Param('invoice_id') invoiceNumber: string, @Res() res: Response) {
    const tenantDbId = await this.getTenantDbId(user);
    const bundle = await this.docBundleService.generateBundle(tenantDbId, invoiceNumber);

    // ZIP must trigger a download (browsers can't render it inline). Merged
    // PDF stays inline so the dispatcher previews it in a new tab.
    const disposition = bundle.format === 'ZIP' ? `attachment; filename="${bundle.fileName}"` : 'inline';

    res.set({
      'Content-Type': bundle.contentType,
      'Content-Disposition': disposition,
      'Content-Length': bundle.buffer.length.toString(),
    });
    res.end(bundle.buffer);
  }

  @Get(':invoice_id/pdf')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Download invoice as PDF' })
  async downloadPdf(@CurrentUser() user: any, @Param('invoice_id') invoiceNumber: string, @Res() res: Response) {
    const tenantDbId = await this.getTenantDbId(user);
    const buffer = await this.invoicePdfService.generatePdf(tenantDbId, invoiceNumber);
    const invoice = await this.invoicingService.findOne(tenantDbId, invoiceNumber);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      'Content-Length': buffer.length.toString(),
    });
    res.end(buffer);
  }

  @Get(':invoice_id/pdf/preview')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Preview invoice PDF inline' })
  async previewPdf(@CurrentUser() user: any, @Param('invoice_id') invoiceNumber: string, @Res() res: Response) {
    const tenantDbId = await this.getTenantDbId(user);
    try {
      const buffer = await this.invoicePdfService.generatePdf(tenantDbId, invoiceNumber);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Content-Length': buffer.length.toString(),
      });
      res.end(buffer);
    } catch (err) {
      this.logger.error('PDF preview generation failed', err instanceof Error ? err.stack : err);
      res.status(500).json({
        message: 'PDF generation failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  @Get(':invoice_id/email-preview')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Preview composed invoice email without sending' })
  async emailPreview(@CurrentUser() user: any, @Param('invoice_id') invoiceNumber: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.invoiceEmailService.buildEmailContent(tenantDbId, invoiceNumber);
  }
}
