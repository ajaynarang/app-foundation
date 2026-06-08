import { Module } from '@nestjs/common';
import { InvoicingModule } from './invoicing/invoicing.module';
import { PaymentsModule } from './payments/payments.module';
import { SettlementsModule } from './settlements/settlements.module';
import { CloseOutModule } from './close-out/close-out.module';

@Module({
  imports: [CloseOutModule, InvoicingModule, PaymentsModule, SettlementsModule],
  exports: [CloseOutModule, InvoicingModule, PaymentsModule, SettlementsModule],
})
export class FinancialsModule {}
