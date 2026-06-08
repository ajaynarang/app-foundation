'use client';

import type { RichCard } from '../../engine/types';
import { AlertCard } from './AlertCard';
import { DriverCard } from './DriverCard';
import { RouteCard } from './RouteCard';
import { HOSCard } from './HOSCard';
import { FleetCard } from './FleetCard';
import { LeadFormCard } from './LeadFormCard';
import { ConfirmationCard } from './ConfirmationCard';
import { InvoiceCard } from './InvoiceCard';
import { InvoiceListCard } from './InvoiceListCard';
import { InvoiceSummaryCard } from './InvoiceSummaryCard';
import { SettlementCard } from './SettlementCard';
import { SettlementListCard } from './SettlementListCard';
import { SettlementSummaryCard } from './SettlementSummaryCard';
import { CustomerCard } from './CustomerCard';
import { CustomerListCard } from './CustomerListCard';
import { DocComplianceCard } from './DocComplianceCard';
import { DocUploadCard } from './DocUploadCard';
import { ShieldCard } from './ShieldCard';
import { ShieldFindingsCard } from './ShieldFindingsCard';
import { DriverDetailCard } from './DriverDetailCard';
import { DriverListCard } from './DriverListCard';
import { VehicleDetailCard } from './VehicleDetailCard';
import { VehicleListCard } from './VehicleListCard';
import { LoadDetailCard } from './LoadDetailCard';
import { CapabilitiesCard } from './CapabilitiesCard';
import { ReportDownloadCard } from './ReportDownloadCard';

export function RichCardRenderer({ card }: { card: RichCard }) {
  switch (card.type) {
    case 'alert':
    case 'alert_list':
      return <AlertCard data={card.data} />;
    case 'driver':
      return <DriverCard data={card.data} />;
    case 'route':
      return <RouteCard data={card.data} />;
    case 'hos':
      return <HOSCard data={card.data} />;
    case 'fleet':
      return <FleetCard data={card.data} />;
    case 'lead_form':
      return <LeadFormCard />;
    case 'confirmation':
      return <ConfirmationCard data={card.data} />;
    case 'invoice':
      return <InvoiceCard data={card.data} />;
    case 'invoice_list':
      return <InvoiceListCard data={card.data} />;
    case 'invoice_summary':
      return <InvoiceSummaryCard data={card.data} />;
    case 'settlement':
      return <SettlementCard data={card.data} />;
    case 'settlement_list':
      return <SettlementListCard data={card.data} />;
    case 'settlement_summary':
      return <SettlementSummaryCard data={card.data} />;
    case 'customer':
      return <CustomerCard data={card.data} />;
    case 'customer_list':
      return <CustomerListCard data={card.data} />;
    case 'doc_compliance':
      return <DocComplianceCard data={card.data} />;
    case 'doc_upload':
      return <DocUploadCard data={card.data} />;
    case 'shield':
      return <ShieldCard data={card.data} />;
    case 'shield_findings':
      return <ShieldFindingsCard data={card.data} />;
    case 'driver_detail':
      return <DriverDetailCard data={card.data} />;
    case 'driver_list':
      return <DriverListCard data={card.data} />;
    case 'vehicle_detail':
      return <VehicleDetailCard data={card.data} />;
    case 'vehicle_list':
      return <VehicleListCard data={card.data} />;
    case 'load_detail':
      return <LoadDetailCard data={card.data} />;
    case 'capabilities':
      return <CapabilitiesCard data={card.data} />;
    case 'report_download':
      return <ReportDownloadCard data={card.data} />;
    default:
      return null;
  }
}
