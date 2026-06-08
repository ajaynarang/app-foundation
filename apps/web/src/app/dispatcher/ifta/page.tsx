'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { PageHeader } from '@/shared/components/page-chrome';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Fuel, Route } from 'lucide-react';
import { FeatureGuard } from '@/features/platform/feature-flags';
import { useIftaQuarters } from '@/features/operations/ifta/hooks/use-ifta';
import { IftaSummaryCards } from '@/features/operations/ifta/components/ifta-summary-cards';
import { IftaQuarterTable } from '@/features/operations/ifta/components/ifta-quarter-table';
import { IftaQuarterDetailSheet } from '@/features/operations/ifta/components/ifta-quarter-detail-sheet';
import { IftaFuelPurchaseSheet } from '@/features/operations/ifta/components/ifta-fuel-purchase-sheet';
import { IftaManualMileageSheet } from '@/features/operations/ifta/components/ifta-manual-mileage-sheet';

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 3 }, (_, i) => currentYear - i);

export default function IftaPage() {
  return (
    <FeatureGuard featureKey="ifta">
      <IftaContent />
    </FeatureGuard>
  );
}

function IftaContent() {
  const [yearFilter, setYearFilter] = useState(String(currentYear));
  const [selectedQuarterId, setSelectedQuarterId] = useState<string | null>(null);
  const [fuelSheetOpen, setFuelSheetOpen] = useState(false);
  const [mileageSheetOpen, setMileageSheetOpen] = useState(false);

  const year = parseInt(yearFilter, 10);

  const { data: quarters, isLoading } = useIftaQuarters({ year });

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <PageHeader
        title="IFTA"
        subtitle="Fuel tax reporting, quarter by quarter"
        actions={
          <>
            <Button variant="outline" onClick={() => setMileageSheetOpen(true)}>
              <Route className="mr-2 h-4 w-4" />
              Record Miles
            </Button>
            <Button onClick={() => setFuelSheetOpen(true)}>
              <Fuel className="mr-2 h-4 w-4" />
              Record Fuel Stop
            </Button>
          </>
        }
      />

      {/* Summary Cards */}
      <IftaSummaryCards quarters={quarters} isLoading={isLoading} currentYear={year} />

      {/* Quarter Table */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 md:p-6">
          <CardTitle className="text-foreground">Quarters</CardTitle>
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-full sm:w-[120px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0 md:px-2 md:pb-2">
          <IftaQuarterTable
            quarters={quarters}
            isLoading={isLoading}
            onSelectQuarter={(id) => setSelectedQuarterId(id)}
          />
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <IftaQuarterDetailSheet
        quarterId={selectedQuarterId ?? undefined}
        open={!!selectedQuarterId}
        onOpenChange={(open) => {
          if (!open) setSelectedQuarterId(null);
        }}
      />

      {/* Fuel Purchase Sheet */}
      <IftaFuelPurchaseSheet open={fuelSheetOpen} onOpenChange={setFuelSheetOpen} />

      {/* Manual Mileage Sheet */}
      <IftaManualMileageSheet open={mileageSheetOpen} onOpenChange={setMileageSheetOpen} />
    </div>
  );
}
