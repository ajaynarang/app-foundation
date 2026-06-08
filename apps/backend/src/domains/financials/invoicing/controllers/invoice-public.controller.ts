import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../../../auth/decorators/public.decorator';
import { InvoiceShareService } from '../services/invoice-share.service';
import { InvoicePdfService } from '../services/invoice-pdf.service';

@ApiTags('Invoice Public')
@Controller('invoices/public')
export class InvoicePublicController {
  constructor(
    private readonly invoiceShareService: InvoiceShareService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  @Get(':token')
  @Public()
  @ApiOperation({ summary: 'View shared invoice' })
  async viewInvoice(@Param('token') token: string) {
    return this.invoiceShareService.getInvoiceByToken(token);
  }

  @Get(':token/pdf')
  @Public()
  @ApiOperation({ summary: 'Download shared invoice PDF' })
  async downloadPdf(@Param('token') token: string, @Res() res: Response) {
    // Validate token and retrieve invoice metadata via the share service
    // (throws NotFoundException / BadRequestException on invalid/expired/voided tokens)
    const link = await this.invoiceShareService.getShareLinkByToken(token);

    const buffer = await this.invoicePdfService.generatePdf(link.invoice.tenantId, link.invoice.invoiceNumber);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${link.invoice.invoiceNumber}.pdf"`,
      'Content-Length': buffer.length.toString(),
    });
    res.end(buffer);
  }
}
