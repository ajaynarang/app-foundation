'use client';

import { useBillingPulse } from '@/features/platform/billing';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { DollarSign, Users, Layers, AlertTriangle } from 'lucide-react';

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'muted' | 'destructive' | 'outline' | 'caution'> = {
  ACTIVE: 'default',
  APPROVED: 'default',
  PENDING_APPROVAL: 'muted',
  SUSPENDED: 'caution',
  REJECTED: 'destructive',
  TRIAL: 'outline',
  TRIAL_EXPIRED: 'outline',
};

function StatsCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-32 mb-1" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );
}

function TableSkeleton({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: cols }).map((_, i) => (
            <TableHead key={i}>
              <Skeleton className="h-4 w-20" />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, row) => (
          <TableRow key={row}>
            {Array.from({ length: cols }).map((_, col) => (
              <TableCell key={col}>
                <Skeleton className="h-4 w-16" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function BillingPulsePage() {
  const { totalMrr, activeSubscriptions, distinctPlans, attentionCount, revenueByPlan, statusBreakdown, isLoading } =
    useBillingPulse();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-9 w-48 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCardSkeleton />
          <StatsCardSkeleton />
          <StatsCardSkeleton />
          <StatsCardSkeleton />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <TableSkeleton rows={4} cols={4} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <TableSkeleton rows={4} cols={3} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasData = activeSubscriptions > 0 || statusBreakdown.length > 0;

  if (!hasData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Billing Pulse</h1>
          <p className="text-muted-foreground mt-1">Aggregate revenue health and subscription overview</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <DollarSign className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium text-foreground">No tenants yet</p>
            <p className="text-sm text-muted-foreground mt-1">Billing data will appear once tenants are onboarded.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Billing Pulse</h1>
        <p className="text-muted-foreground mt-1">Aggregate revenue health and subscription overview</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Est. MRR</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">{formatCurrency(totalMrr)}</div>
            <p className="text-xs text-muted-foreground mt-1">Monthly recurring revenue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Subscriptions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">{activeSubscriptions}</div>
            <p className="text-xs text-muted-foreground mt-1">Approved or active tenants</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Plans in Use</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">{distinctPlans}</div>
            <p className="text-xs text-muted-foreground mt-1">Distinct plan types assigned</p>
          </CardContent>
        </Card>

        <Card className={attentionCount > 0 ? 'border-amber-500/50' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle
              className={`text-sm font-medium ${attentionCount > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}
            >
              Attention
            </CardTitle>
            <AlertTriangle className={`h-4 w-4 ${attentionCount > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold font-mono ${attentionCount > 0 ? 'text-amber-500' : 'text-foreground'}`}
            >
              {attentionCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Suspended + recently rejected</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue by Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Revenue by Plan</CardTitle>
          <CardDescription>MRR contribution breakdown across plan tiers</CardDescription>
        </CardHeader>
        <CardContent>
          {revenueByPlan.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No active plan revenue data available.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan Name</TableHead>
                  <TableHead className="text-right">Tenants</TableHead>
                  <TableHead className="text-right">MRR Contribution</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenueByPlan.map((row) => (
                  <TableRow key={row.planName}>
                    <TableCell className="font-medium text-foreground">{row.planName}</TableCell>
                    <TableCell className="text-right font-mono text-foreground">{row.tenantCount}</TableCell>
                    <TableCell className="text-right font-mono text-foreground">{formatCurrency(row.mrr)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatPercent(row.percentage)}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals footer row */}
                <TableRow className="border-t-2 border-border font-bold">
                  <TableCell className="text-foreground">Total</TableCell>
                  <TableCell className="text-right font-mono text-foreground">
                    {revenueByPlan.reduce((sum, r) => sum + r.tenantCount, 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-foreground">{formatCurrency(totalMrr)}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">100.0%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tenant Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Tenant Breakdown</CardTitle>
          <CardDescription>Distribution of tenants across lifecycle statuses</CardDescription>
        </CardHeader>
        <CardContent>
          {statusBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No tenant data available.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statusBreakdown.map((row) => (
                  <TableRow key={row.status}>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[row.status] ?? 'outline'}>
                        {row.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-foreground">{row.count}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatPercent(row.percentage)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
