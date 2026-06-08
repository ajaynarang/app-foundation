'use client';

import { useState } from 'react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Fuel, ScanLine } from 'lucide-react';
import { FuelLogForm } from './fuel-log-form';
import { ReceiptScanner } from './receipt-scanner';
import type { FuelReceiptExtraction } from '@sally/shared-types';

export function FuelLogButton() {
  const [formOpen, setFormOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [prefillData, setPrefillData] = useState<FuelReceiptExtraction | null>(null);

  function handleScanComplete(data: FuelReceiptExtraction) {
    setPrefillData(data);
    setFormOpen(true);
  }

  function handleFormClose(open: boolean) {
    if (!open) setPrefillData(null);
    setFormOpen(open);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Card
          className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors active:scale-[0.98]"
          onClick={() => setScannerOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setScannerOpen(true);
            }
          }}
          aria-label="Scan fuel receipt"
        >
          <CardContent className="flex flex-col items-center gap-2 p-4 min-h-[44px]">
            <ScanLine className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="text-center">
              <p className="font-medium text-foreground text-sm">Scan Receipt</p>
              <p className="text-xs text-muted-foreground">Photo → auto-fill</p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors active:scale-[0.98]"
          onClick={() => setFormOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setFormOpen(true);
            }
          }}
          aria-label="Log fuel purchase manually"
        >
          <CardContent className="flex flex-col items-center gap-2 p-4 min-h-[44px]">
            <Fuel className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="text-center">
              <p className="font-medium text-foreground text-sm">Log Fuel</p>
              <p className="text-xs text-muted-foreground">Manual entry</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <ReceiptScanner open={scannerOpen} onOpenChange={setScannerOpen} onExtracted={handleScanComplete} />

      <FuelLogForm
        open={formOpen}
        onOpenChange={handleFormClose}
        prefillData={prefillData ?? undefined}
        source={prefillData ? 'RECEIPT_SCAN' : 'MANUAL'}
      />
    </>
  );
}
