'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { CreditCard, Plus, Trash2, Star, Wallet, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@app/ui/components/ui/card';
import { Badge } from '@app/ui/components/ui/badge';
import { Button } from '@app/ui/components/ui/button';
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';
import { Switch } from '@app/ui/components/ui/switch';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@app/ui/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import {
  useWalletBalance,
  usePaymentMethods,
  useUpcomingInvoice,
  useTopUpWallet,
  useUpdateAutoReload,
  useSetDefaultPaymentMethod,
  useRemovePaymentMethod,
  useSetupPaymentMethod,
} from '@/features/billing/hooks/use-billing';
import { formatCents } from '@appshore/web-core/shared/lib/utils/formatters';
import { formatTransactionType, getTransactionTypeVariant } from '@/features/billing/utils';
import { cn } from '@app/ui';

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">Wallet, payment methods, and invoices</p>
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card brand icon helper
// ---------------------------------------------------------------------------
function cardBrandLabel(brand: string): string {
  const map: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'Amex',
    discover: 'Discover',
    diners: 'Diners',
    jcb: 'JCB',
    unionpay: 'UnionPay',
  };
  return map[brand.toLowerCase()] ?? brand;
}

// ---------------------------------------------------------------------------
// Top-Up Sheet
// ---------------------------------------------------------------------------
const PRESET_AMOUNTS_CENTS = [2500, 5000, 10000, 20000];

function TopUpSheet({
  open,
  onOpenChange,
  currentBalanceCents,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalanceCents: number;
}) {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(5000);
  const [customAmount, setCustomAmount] = useState('');
  const { mutate: topUp, isPending } = useTopUpWallet();

  const amountCents = selectedPreset ?? Math.round(parseFloat(customAmount || '0') * 100);
  const isValid = amountCents >= 100;

  function handleSubmit() {
    if (!isValid) return;
    topUp(
      { amountCents },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add Funds to Wallet"
      description={`Current balance: ${formatCents(currentBalanceCents)}`}
      mode="edit"
      onSubmit={handleSubmit}
      submitLabel={`Add ${isValid ? formatCents(amountCents) : '$0.00'}`}
      isSubmitting={isPending}
      submitDisabled={!isValid}
      pinnable
      resizable
    >
      <div className="space-y-5">
        {/* Preset amounts */}
        <div className="space-y-2">
          <Label>Select Amount</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESET_AMOUNTS_CENTS.map((cents) => (
              <Button
                key={cents}
                type="button"
                variant={selectedPreset === cents ? 'default' : 'outline'}
                className="h-11"
                onClick={() => {
                  setSelectedPreset(cents);
                  setCustomAmount('');
                }}
              >
                {formatCents(cents)}
              </Button>
            ))}
          </div>
        </div>

        {/* Custom amount */}
        <div className="space-y-2">
          <Label htmlFor="custom-amount">Custom Amount</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input
              id="custom-amount"
              type="number"
              min="1"
              step="0.01"
              placeholder="0.00"
              className="pl-7"
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setSelectedPreset(null);
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Minimum $1.00</p>
        </div>
      </div>
    </FormSheet>
  );
}

// ---------------------------------------------------------------------------
// Auto-Reload Sheet
// ---------------------------------------------------------------------------
function AutoReloadSheet({
  open,
  onOpenChange,
  currentEnabled,
  currentThreshold,
  currentAmount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEnabled: boolean;
  currentThreshold: number | null;
  currentAmount: number | null;
}) {
  const [enabled, setEnabled] = useState(currentEnabled);
  const [threshold, setThreshold] = useState(currentThreshold ? (currentThreshold / 100).toString() : '10');
  const [amount, setAmount] = useState(currentAmount ? (currentAmount / 100).toString() : '25');
  const { mutate: update, isPending } = useUpdateAutoReload();

  function handleSubmit() {
    update(
      {
        enabled,
        thresholdCents: Math.round(parseFloat(threshold) * 100),
        reloadAmountCents: Math.round(parseFloat(amount) * 100),
      },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Auto-Reload Settings"
      description="Automatically add funds when your balance drops below a threshold."
      mode="edit"
      onSubmit={handleSubmit}
      submitLabel="Save Settings"
      isSubmitting={isPending}
      pinnable
      resizable
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Label htmlFor="auto-reload-toggle">Enable Auto-Reload</Label>
          <Switch id="auto-reload-toggle" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {enabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="threshold">When balance drops below</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  id="threshold"
                  type="number"
                  min="0"
                  step="1"
                  className="pl-7"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reload-amount">Reload amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  id="reload-amount"
                  type="number"
                  min="5"
                  step="1"
                  className="pl-7"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">Minimum $5.00</p>
            </div>
          </>
        )}
      </div>
    </FormSheet>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function BillingPage() {
  const { data: walletData, isLoading: walletLoading } = useWalletBalance();
  const { data: paymentMethods, isLoading: pmLoading } = usePaymentMethods();
  const { data: upcomingInvoice, isLoading: invoiceLoading } = useUpcomingInvoice();
  const { mutate: setDefault, isPending: setDefaultPending } = useSetDefaultPaymentMethod();
  const { mutate: removePm, isPending: removePending } = useRemovePaymentMethod();
  const { mutate: setupPm, isPending: setupPending } = useSetupPaymentMethod();

  const [topUpOpen, setTopUpOpen] = useState(false);
  const [autoReloadOpen, setAutoReloadOpen] = useState(false);

  const isLoading = walletLoading || pmLoading || invoiceLoading;

  const wallet = walletData?.wallet;
  const recentTransactions = walletData?.recentTransactions ?? [];

  const sortedMethods = useMemo(
    () => [...(paymentMethods ?? [])].sort((a, b) => (a.isDefault === b.isDefault ? 0 : a.isDefault ? -1 : 1)),
    [paymentMethods],
  );

  if (isLoading) {
    return <BillingSkeleton />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">Wallet, payment methods, and invoices</p>
      </div>

      {/* Section 1: Wallet */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Wallet</h2>
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Available Balance</p>
                <p className="text-3xl font-bold text-foreground tracking-tight">
                  {formatCents(wallet?.balanceCents ?? 0)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => setTopUpOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Funds
                </Button>
                <Button variant="outline" size="sm" onClick={() => setAutoReloadOpen(true)}>
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                  Auto-Reload
                  {wallet?.autoReloadEnabled && (
                    <Badge variant="default" className="ml-1.5 text-2xs">
                      On
                    </Badge>
                  )}
                </Button>
              </div>
            </div>

            {/* Recent transactions */}
            {recentTransactions.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent Activity</p>
                {recentTransactions.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={getTransactionTypeVariant(tx.type)} className="text-2xs">
                        {formatTransactionType(tx.type)}
                      </Badge>
                      <span className="text-muted-foreground truncate max-w-[200px]">{tx.description}</span>
                    </div>
                    <span
                      className={cn(
                        'font-medium tabular-nums',
                        tx.amountCents >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
                      )}
                    >
                      {tx.amountCents >= 0 ? '+' : ''}
                      {formatCents(tx.amountCents)}
                    </span>
                  </div>
                ))}
                <Link
                  href="/settings/usage"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
                >
                  View all transactions
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Section 2: Payment Methods */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Payment Methods</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setupPm({
                returnUrl: `${window.location.origin}/settings/billing`,
              })
            }
            loading={setupPending}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Payment Method
          </Button>
        </div>

        {sortedMethods.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-foreground mb-1">No payment methods</h3>
              <p className="text-sm text-muted-foreground mb-4">Add a payment method to get started with billing.</p>
              <Button
                size="sm"
                onClick={() =>
                  setupPm({
                    returnUrl: `${window.location.origin}/settings/billing`,
                  })
                }
                loading={setupPending}
              >
                Add Payment Method
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {sortedMethods.map((pm) => (
              <Card key={pm.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <CreditCard className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {cardBrandLabel(pm.brand)} ····{pm.last4}
                          </span>
                          {pm.isDefault && (
                            <Badge variant="outline" className="text-2xs">
                              <Star className="h-3 w-3 mr-1" />
                              Default
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Expires {String(pm.expMonth).padStart(2, '0')}/{pm.expYear}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!pm.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => setDefault(pm.id)}
                          disabled={setDefaultPending}
                        >
                          Set Default
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            disabled={pm.isDefault}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove payment method?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove the {cardBrandLabel(pm.brand)} card ending in {pm.last4}.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removePm(pm.id)}
                              disabled={removePending}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Section 3: Next Invoice Preview */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Next Invoice Preview</h2>

        {upcomingInvoice ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right w-[80px]">Qty</TableHead>
                    <TableHead className="text-right w-[100px]">Unit Price</TableHead>
                    <TableHead className="text-right w-[100px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingInvoice.lineItems.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm text-foreground">{item.description}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {formatCents(item.unitPriceCents)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-foreground tabular-nums">
                        {formatCents(item.totalCents)}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Subtotal */}
                  <TableRow>
                    <TableCell colSpan={3} className="text-sm text-muted-foreground text-right">
                      Subtotal
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium text-foreground tabular-nums">
                      {formatCents(upcomingInvoice.amountDueCents - upcomingInvoice.taxCents)}
                    </TableCell>
                  </TableRow>

                  {/* Tax */}
                  {upcomingInvoice.taxCents > 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-sm text-muted-foreground text-right">
                        Tax
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {formatCents(upcomingInvoice.taxCents)}
                      </TableCell>
                    </TableRow>
                  )}

                  {/* Total */}
                  <TableRow className="bg-muted/50">
                    <TableCell colSpan={3} className="text-sm font-semibold text-foreground text-right">
                      Total due{' '}
                      {upcomingInvoice.periodEnd
                        ? `on ${new Date(upcomingInvoice.periodEnd).toLocaleDateString()}`
                        : ''}
                    </TableCell>
                    <TableCell className="text-right text-sm font-bold text-foreground tabular-nums">
                      {formatCents(upcomingInvoice.amountDueCents)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <Wallet className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-foreground mb-1">No upcoming invoice</h3>
              <p className="text-sm text-muted-foreground">Subscribe to a plan to see your next invoice preview.</p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Sheets */}
      <TopUpSheet open={topUpOpen} onOpenChange={setTopUpOpen} currentBalanceCents={wallet?.balanceCents ?? 0} />
      {wallet && (
        <AutoReloadSheet
          open={autoReloadOpen}
          onOpenChange={setAutoReloadOpen}
          currentEnabled={wallet.autoReloadEnabled}
          currentThreshold={wallet.autoReloadThresholdCents}
          currentAmount={wallet.autoReloadAmountCents}
        />
      )}
    </div>
  );
}
