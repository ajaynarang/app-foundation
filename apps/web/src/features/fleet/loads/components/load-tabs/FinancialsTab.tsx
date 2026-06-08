'use client';

import { useState } from 'react';
import { Plus, Trash2, DollarSign } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@sally/ui/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { BillingReadinessSection } from '@/features/financials/close-out/components/billing-readiness-section';
import { useBillingReadiness } from '@/features/financials/close-out/hooks/use-close-out';
import { useLoadCharges, useAddCharge, useRemoveCharge } from '@/features/fleet/loads/hooks/use-loads';
import type { Load } from '@/features/fleet/loads/types';

interface FinancialsTabProps {
  load: Load;
  readOnly?: boolean;
}

export function FinancialsTab({ load, readOnly }: FinancialsTabProps) {
  const isDelivered = load.status === 'DELIVERED';
  const { data: charges, isLoading } = useLoadCharges(load.loadNumber);
  const addChargeMutation = useAddCharge();
  const removeChargeMutation = useRemoveCharge();
  const { data: readiness } = useBillingReadiness(isDelivered ? load.loadNumber : null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newCharge, setNewCharge] = useState({
    chargeType: 'linehaul',
    description: '',
    quantity: 1,
  });
  const [unitPriceInput, setUnitPriceInput] = useState('');
  const [chargeErrors, setChargeErrors] = useState<{
    quantity?: string;
    unitPrice?: string;
  }>({});

  const handleAddCharge = () => {
    const dollars = parseFloat(unitPriceInput);
    const cents = isNaN(dollars) ? 0 : Math.round(dollars * 100);
    const errors: { quantity?: string; unitPrice?: string } = {};

    if (newCharge.quantity < 1 || newCharge.quantity > 999) {
      errors.quantity = 'Quantity must be between 1 and 999';
    }
    if (cents <= 0) {
      errors.unitPrice = 'Unit price is required';
    } else if (dollars > 99999.99) {
      errors.unitPrice = 'Unit price cannot exceed $99,999.99';
    }

    if (Object.keys(errors).length > 0) {
      setChargeErrors(errors);
      return;
    }
    setChargeErrors({});
    addChargeMutation.mutate(
      { loadId: load.loadNumber, data: { ...newCharge, unitPriceCents: cents } },
      {
        onSuccess: () => {
          setIsAddOpen(false);
          setNewCharge({ chargeType: 'linehaul', description: '', quantity: 1 });
          setUnitPriceInput('');
          setChargeErrors({});
        },
      },
    );
  };

  const totalCents = charges?.reduce((sum, c) => sum + c.totalCents, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Charges section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Charges</span>
            {!isLoading && charges && charges.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {charges.length} · ${(totalCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>
          {!readOnly && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsAddOpen(true)}>
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !charges?.length ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No charges</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs text-right">Total</TableHead>
                <TableHead className="text-xs w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {charges.map((charge) => (
                <TableRow key={charge.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-2xs">
                      {(charge.chargeType ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-foreground">{charge.description}</TableCell>
                  <TableCell className="text-xs text-foreground text-right">
                    $
                    {(charge.totalCents / 100).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-critical"
                      onClick={() =>
                        removeChargeMutation.mutate({
                          loadId: load.loadNumber,
                          chargeId: charge.id,
                        })
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={2} className="text-xs font-medium text-foreground">
                  Total
                </TableCell>
                <TableCell className="text-xs font-medium text-foreground text-right">
                  $
                  {(totalCents / 100).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </div>

      {/* Billing Readiness — delivered loads only */}
      {isDelivered && <BillingReadinessSection readiness={readiness} loading={!readiness && isDelivered} />}

      {/* Add charge dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Charge</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={newCharge.chargeType} onValueChange={(v) => setNewCharge({ ...newCharge, chargeType: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linehaul">Linehaul</SelectItem>
                  <SelectItem value="fuel_surcharge">Fuel Surcharge</SelectItem>
                  <SelectItem value="detention_pickup">Detention (Pickup)</SelectItem>
                  <SelectItem value="detention_delivery">Detention (Delivery)</SelectItem>
                  <SelectItem value="layover">Layover</SelectItem>
                  <SelectItem value="lumper">Lumper</SelectItem>
                  <SelectItem value="tonu">TONU</SelectItem>
                  <SelectItem value="accessorial">Accessorial</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input
                className="mt-1"
                value={newCharge.description}
                onChange={(e) => setNewCharge({ ...newCharge, description: e.target.value })}
                placeholder="Charge description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Quantity</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min="1"
                  step="1"
                  value={newCharge.quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (isNaN(val) || val < 0) return;
                    if (val > 999) return;
                    setNewCharge({ ...newCharge, quantity: val || 1 });
                    setChargeErrors((prev) => ({
                      ...prev,
                      quantity: undefined,
                    }));
                  }}
                />
                {chargeErrors.quantity && <p className="text-xs text-critical mt-1">{chargeErrors.quantity}</p>}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Unit Price ($)</Label>
                <Input
                  className="mt-1"
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitPriceInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setUnitPriceInput('');
                      setChargeErrors((prev) => ({
                        ...prev,
                        unitPrice: undefined,
                      }));
                      return;
                    }
                    const num = parseFloat(val);
                    if (num > 99999.99) return;
                    setUnitPriceInput(val);
                    setChargeErrors((prev) => ({
                      ...prev,
                      unitPrice: undefined,
                    }));
                  }}
                  placeholder="0.00"
                />
                {chargeErrors.unitPrice && <p className="text-xs text-critical mt-1">{chargeErrors.unitPrice}</p>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCharge} loading={addChargeMutation.isPending}>
              Add Charge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
