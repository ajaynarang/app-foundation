'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  RotateCcw,
  Clock,
} from 'lucide-react';
import { useLoads } from '@/features/fleet/loads/hooks/use-loads';
import type { LoadListItem, LoadListFilters, LoadStatus } from '@/features/fleet/loads/types';
import { getStatusVariant } from '@/features/fleet/loads/components/LoadDetailPanel';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { useReferenceData } from '@/features/platform/reference-data';
import { STORAGE_KEYS } from '@/shared/constants';
import { useRelayEnabled } from '@/features/fleet/loads/hooks/use-load-legs';
import { RELAY_BADGE_CLASS } from '@/features/fleet/loads/constants/relay';
import { cn } from '@sally/ui';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { ColumnCustomizer } from './ColumnCustomizer';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { TripBadge } from '@/features/fleet/trips/components/TripBadge';
import { GHOST_IMPORT_STATUS, type GhostImport } from '@/features/fleet/loads/types/ratecon';

// ─── Column definitions ───────────────────────────────────────────────────────

export interface TableColumnDef {
  key: string;
  label: string;
  /** Column cannot be hidden */
  locked?: boolean;
  /** Visible when user hasn't customized */
  defaultVisible?: boolean;
  /** Server-side sortBy key (omit if not sortable) */
  sortKey?: string;
  /** Tailwind class to hide on smaller screens */
  responsiveHide?: string;
  /** Right-align (for numbers/currency) */
  alignRight?: boolean;
}

const COLUMNS: TableColumnDef[] = [
  { key: 'loadNumber', label: 'Load #', locked: true, defaultVisible: true },
  { key: 'status', label: 'Status', locked: true, defaultVisible: true },
  { key: 'customerName', label: 'Customer', locked: true, defaultVisible: true, sortKey: 'customerName' },
  { key: 'route', label: 'Route', locked: true, defaultVisible: true },
  {
    key: 'pickupDate',
    label: 'Pickup',
    locked: true,
    defaultVisible: true,
    sortKey: 'pickupDate',
    responsiveHide: 'hidden lg:table-cell',
  },
  { key: 'driver', label: 'Driver / Vehicle', locked: true, defaultVisible: true },
  { key: 'rateCents', label: 'Rate', locked: true, defaultVisible: true, sortKey: 'rateCents', alignRight: true },
  {
    key: 'deliveryDate',
    label: 'Delivery',
    defaultVisible: true,
    sortKey: 'deliveryDate',
    responsiveHide: 'hidden lg:table-cell',
  },
  { key: 'equipmentType', label: 'Equipment', defaultVisible: true, responsiveHide: 'hidden xl:table-cell' },
  // Hidden by default — dispatcher toggles as needed
  { key: 'weightLbs', label: 'Weight', defaultVisible: false, responsiveHide: 'hidden xl:table-cell' },
  { key: 'pieces', label: 'Pieces', defaultVisible: false, responsiveHide: 'hidden xl:table-cell' },
  { key: 'stopCount', label: 'Stops', defaultVisible: false },
  { key: 'billingStatus', label: 'Billing', defaultVisible: false, responsiveHide: 'hidden lg:table-cell' },
  { key: 'intakeSource', label: 'Source', defaultVisible: false, responsiveHide: 'hidden lg:table-cell' },
  {
    key: 'driverPayCents',
    label: 'Driver Pay',
    defaultVisible: false,
    alignRight: true,
    responsiveHide: 'hidden xl:table-cell',
  },
  { key: 'payStatus', label: 'Pay Status', defaultVisible: false, responsiveHide: 'hidden xl:table-cell' },
  {
    key: 'assignedAt',
    label: 'Assigned At',
    defaultVisible: false,
    sortKey: 'assignedAt',
    responsiveHide: 'hidden xl:table-cell',
  },
  { key: 'trip', label: 'Trip', defaultVisible: false, responsiveHide: 'hidden xl:table-cell' },
];

const DEFAULT_VISIBLE_KEYS = new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));

/** Column config + default visibility, exported so the page filter row can host the customizer. */
export const LOADS_TABLE_COLUMN_DEFS = COLUMNS;
export const LOADS_TABLE_DEFAULT_COLUMNS = DEFAULT_VISIBLE_KEYS;

/** Active load statuses — the default scope when no specific status filter is applied. */
const ACTIVE_STATUSES: LoadStatus[] = ['DRAFT', 'PENDING', 'ASSIGNED', 'IN_TRANSIT', 'ON_HOLD'];

const PAGE_SIZE = 25;

// ─── localStorage helpers ─────────────────────────────────────────────────────

function readStoredSet(key: string, fallback: Set<string>): Set<string> {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed as string[]) : fallback;
  } catch {
    return fallback;
  }
}

function persistSet(key: string, set: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

// ─── Component ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const STALE_WARNING_MS = 2 * 60 * 1000;
const STALE_ACTION_MS = 5 * 60 * 1000;

interface LoadsTableViewProps {
  /** Active status to filter to; undefined = all active statuses. Driven by the page filter row. */
  statusFilter?: LoadStatus;
  /** Search query, driven by the shared page filter row. */
  search?: string;
  /**
   * Visible column keys, when the column customizer is hosted by the page filter row.
   * When provided, the table is controlled and renders no internal customizer.
   */
  visibleColumnKeys?: Set<string>;
  onLoadClick: (load: LoadListItem) => void;
  selectedLoadIds?: Set<string>;
  onToggleSelect?: (loadId: string, loadData?: LoadListItem) => void;
  ghostImports?: GhostImport[];
  onGhostDismiss?: (jobId: number) => void;
  onGhostCancel?: (jobId: number) => void;
  onGhostRetry?: (jobId: number) => void;
  onGhostCheckStatus?: (jobId: number) => void;
  onGhostClick?: (ghost: GhostImport) => void;
}

export function LoadsTableView({
  statusFilter,
  search,
  visibleColumnKeys,
  onLoadClick,
  selectedLoadIds,
  onToggleSelect,
  ghostImports,
  onGhostDismiss,
  onGhostCancel,
  onGhostRetry,
  onGhostCheckStatus,
  onGhostClick,
}: LoadsTableViewProps) {
  const { formatCalendarDate, formatCents } = useFormatters();
  const { data: refData } = useReferenceData(['equipment_type']);
  const relayEnabled = useRelayEnabled();

  // ── Column visibility ──
  // Controlled by the page (customizer in the filter row) when `visibleColumnKeys` is
  // provided; otherwise self-managed + persisted for standalone use.
  const isColumnsControlled = visibleColumnKeys !== undefined;
  const [internalVisibleKeys, setInternalVisibleKeys] = useState<Set<string>>(() =>
    readStoredSet(STORAGE_KEYS.LOADS_TABLE_COLUMNS, DEFAULT_VISIBLE_KEYS),
  );
  const visibleKeys = isColumnsControlled ? visibleColumnKeys : internalVisibleKeys;
  const setVisibleKeys = setInternalVisibleKeys;

  useEffect(() => {
    if (!isColumnsControlled) persistSet(STORAGE_KEYS.LOADS_TABLE_COLUMNS, internalVisibleKeys);
  }, [isColumnsControlled, internalVisibleKeys]);

  const toggleColumn = useCallback((key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const resetColumns = useCallback(() => {
    setVisibleKeys(new Set(DEFAULT_VISIBLE_KEYS));
  }, []);

  // ── Sort & pagination (status + search come from the page filter row via props) ──

  const [sortBy, setSortBy] = useState<string>('pickupDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [offset, setOffset] = useState(0);

  // Reset to the first page whenever the page-level filters change.
  useEffect(() => {
    setOffset(0);
  }, [statusFilter, search]);

  const handleSort = useCallback((key: string) => {
    setOffset(0);
    setSortBy((prev) => {
      if (prev === key) {
        setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortOrder('asc');
      return key;
    });
  }, []);

  // ── TanStack Query (shares cache & SSE invalidation with rest of app) ──

  const filters = useMemo<LoadListFilters>(
    () => ({
      status: statusFilter ?? ACTIVE_STATUSES.join(','),
      search: search || undefined,
      sortBy,
      sortOrder,
      limit: PAGE_SIZE,
      offset,
    }),
    [statusFilter, search, sortBy, sortOrder, offset],
  );

  const { data, isLoading } = useLoads(filters);
  const loads = data?.data ?? [];
  const total = data?.total ?? 0;

  // ── Derived ──

  const visibleColumns = useMemo(() => COLUMNS.filter((col) => col.locked || visibleKeys.has(col.key)), [visibleKeys]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Format helpers (delegates to shared utils) ──

  const fmtDate = useCallback(
    (dateStr?: string | null) => formatCalendarDate(dateStr ?? null, DISPLAY_FORMATS.FRIENDLY),
    [formatCalendarDate],
  );

  const fmtCents = useCallback((cents?: number | null) => (cents != null ? formatCents(cents) : '—'), [formatCents]);

  const getEquipmentLabel = useCallback(
    (code?: string | null) => {
      if (!code) return '—';
      return (
        refData?.equipmentType?.find((item) => item.code.toLowerCase() === code.toLowerCase())?.label ??
        code.replace(/_/g, ' ')
      );
    },
    [refData],
  );

  // ── Cell renderer ──

  const renderCell = useCallback(
    (col: TableColumnDef, load: LoadListItem) => {
      const isRelay = relayEnabled && load.isRelay;
      const activeLeg = isRelay ? load.activeLeg : null;
      const displayDriver = isRelay && activeLeg ? activeLeg.driverName : load.driverName;
      const displayVehicle = isRelay && activeLeg ? activeLeg.vehicleUnitNumber : load.vehicleUnitNumber;

      switch (col.key) {
        case 'loadNumber':
          return (
            <div className="flex items-center gap-1.5">
              <div>
                <span className="font-mono font-medium text-foreground text-xs">{load.loadNumber}</span>
                {load.referenceNumber && (
                  <p className="text-2xs text-muted-foreground leading-tight">Ref: {load.referenceNumber}</p>
                )}
              </div>
              {isRelay && (
                <Badge variant="outline" className={cn(RELAY_BADGE_CLASS, 'text-[9px] px-1 py-0')}>
                  RELAY
                </Badge>
              )}
            </div>
          );

        case 'status':
          return (
            <Badge variant={getStatusVariant(load.status)} className="text-2xs capitalize whitespace-nowrap">
              {load.status?.replace(/_/g, ' ').toLowerCase()}
            </Badge>
          );

        case 'customerName':
          return (
            <span className="text-foreground text-xs truncate max-w-[160px] block">{load.customerName || '—'}</span>
          );

        case 'route':
          return (
            <span className="text-foreground text-xs whitespace-nowrap">
              {load.originCity && load.destinationCity
                ? `${load.originCity}, ${load.originState ?? ''} → ${load.destinationCity}, ${load.destinationState ?? ''}`
                : `${load.stopCount ?? 0} stop${(load.stopCount ?? 0) !== 1 ? 's' : ''}`}
            </span>
          );

        case 'pickupDate': {
          const d = fmtDate(load.pickupDate);
          const display = d && load.pickupTime ? `${d}, ${load.pickupTime}` : d;
          return <span className="text-foreground text-xs whitespace-nowrap">{display ?? '—'}</span>;
        }

        case 'deliveryDate': {
          const d = fmtDate(load.deliveryDate);
          const display = d && load.deliveryTime ? `${d}, ${load.deliveryTime}` : d;
          return <span className="text-foreground text-xs whitespace-nowrap">{display ?? '—'}</span>;
        }

        case 'driver':
          return displayDriver ? (
            <div className="text-xs">
              <span className="text-foreground">{displayDriver}</span>
              {displayVehicle && <span className="text-muted-foreground ml-1">· {displayVehicle}</span>}
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">Unassigned</span>
          );

        case 'rateCents':
          return <span className="text-foreground text-xs font-medium">{fmtCents(load.rateCents)}</span>;

        case 'equipmentType':
          return (
            <span className="text-foreground text-xs capitalize">{getEquipmentLabel(load.requiredEquipmentType)}</span>
          );

        case 'weightLbs':
          return (
            <span className="text-foreground text-xs">
              {load.weightLbs ? `${load.weightLbs.toLocaleString()} lbs` : '—'}
            </span>
          );

        case 'pieces':
          return <span className="text-foreground text-xs">{load.pieces ?? '—'}</span>;

        case 'stopCount':
          return <span className="text-foreground text-xs">{load.stopCount ?? '—'}</span>;

        case 'billingStatus':
          return load.billingStatus ? (
            <Badge variant="outline" className="text-2xs capitalize">
              {load.billingStatus.replace(/_/g, ' ')}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          );

        case 'intakeSource':
          return (
            <span className="text-muted-foreground text-2xs capitalize">
              {load.intakeSource?.replace(/_/g, ' ') ?? 'Manual'}
            </span>
          );

        case 'driverPayCents':
          return <span className="text-foreground text-xs">{fmtCents(load.driverPayCents)}</span>;

        case 'payStatus':
          return load.payStatus ? (
            <Badge variant="outline" className="text-2xs capitalize">
              {load.payStatus.replace(/_/g, ' ')}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          );

        case 'assignedAt':
          return <span className="text-foreground text-xs whitespace-nowrap">{fmtDate(load.assignedAt)}</span>;

        case 'trip':
          return load.tripId ? (
            <TripBadge tripId={load.tripId} tripOrder={load.tripOrder} tripLoadCount={load.tripLoadCount} size="sm" />
          ) : null;

        default:
          return null;
      }
    },
    [relayEnabled, fmtDate, fmtCents, getEquipmentLabel],
  );

  // ── Render ──

  return (
    <div className="flex flex-col gap-3 pb-4">
      {/* Column customizer only renders here when standalone; on the dispatcher Loads page
          it's hosted in the filter row (controlled via visibleColumnKeys). */}
      {!isColumnsControlled && (
        <div className="flex items-center justify-end">
          <ColumnCustomizer
            columns={COLUMNS}
            visibleKeys={visibleKeys}
            onToggle={toggleColumn}
            onReset={resetColumns}
          />
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      ) : loads.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground">No loads match your filters</p>
      ) : (
        <div className="rounded-md border border-border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {onToggleSelect && <TableHead className="w-10" />}
                {visibleColumns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={cn(
                      col.responsiveHide,
                      col.alignRight && 'text-right',
                      col.sortKey && 'cursor-pointer select-none hover:text-foreground',
                    )}
                    onClick={col.sortKey ? () => handleSort(col.sortKey!) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.sortKey &&
                        (sortBy === col.sortKey ? (
                          sortOrder === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-30" />
                        ))}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ghostImports?.map((ghost) => (
                <GhostTableRow
                  key={ghost.jobId}
                  ghost={ghost}
                  colSpan={visibleColumns.length + (onToggleSelect ? 1 : 0)}
                  onDismiss={onGhostDismiss}
                  onCancel={onGhostCancel}
                  onRetry={onGhostRetry}
                  onCheckStatus={onGhostCheckStatus}
                  onClick={onGhostClick}
                />
              ))}
              {loads.map((load) => (
                <TableRow
                  key={load.loadNumber}
                  className={cn(
                    'cursor-pointer hover:bg-muted/50',
                    selectedLoadIds?.has(load.loadNumber) && 'bg-primary/5 dark:bg-primary/10',
                  )}
                  onClick={() => onLoadClick(load)}
                >
                  {onToggleSelect && (
                    <TableCell className="w-10 pr-0" onClick={(e) => e.stopPropagation()}>
                      {!load.tripId && !load.isRelay && ['DRAFT', 'PENDING'].includes(load.status) && (
                        <Checkbox
                          checked={selectedLoadIds?.has(load.loadNumber) ?? false}
                          onCheckedChange={() => onToggleSelect(load.loadNumber, load)}
                          className="h-4 w-4"
                        />
                      )}
                    </TableCell>
                  )}
                  {visibleColumns.map((col) => (
                    <TableCell key={col.key} className={cn(col.responsiveHide, col.alignRight && 'text-right')}>
                      {renderCell(col, load)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination — extra right padding so the Next button clears the floating Ask-Sally orb */}
      {!isLoading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between pr-16 sm:pr-20">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              <ChevronLeft className="h-3 w-3 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Ghost row for processing rate-con imports ───────────────────────────────

function GhostTableRow({
  ghost,
  colSpan,
  onDismiss,
  onCancel,
  onRetry,
  onCheckStatus,
  onClick,
}: {
  ghost: GhostImport;
  colSpan: number;
  onDismiss?: (jobId: number) => void;
  onCancel?: (jobId: number) => void;
  onRetry?: (jobId: number) => void;
  onCheckStatus?: (jobId: number) => void;
  onClick?: (ghost: GhostImport) => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (ghost.status !== GHOST_IMPORT_STATUS.PROCESSING) return;
    const update = () => setElapsed(Date.now() - new Date(ghost.startedAt).getTime());
    update();
    const interval = setInterval(update, 10_000);
    return () => clearInterval(interval);
  }, [ghost.status, ghost.startedAt]);

  const isStaleWarning = ghost.status === GHOST_IMPORT_STATUS.PROCESSING && elapsed > STALE_WARNING_MS;
  const isStaleAction = ghost.status === GHOST_IMPORT_STATUS.PROCESSING && elapsed > STALE_ACTION_MS;

  if (ghost.status === GHOST_IMPORT_STATUS.COMPLETED) {
    return (
      <TableRow className="pointer-events-none bg-accent/5">
        <TableCell colSpan={colSpan}>
          <div className="flex items-center gap-2 py-0.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-foreground shrink-0" />
            <span className="text-xs font-medium text-foreground">Load #{ghost.loadNumber} created</span>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  if (ghost.status === GHOST_IMPORT_STATUS.FAILED) {
    return (
      <TableRow
        className="bg-destructive/5 dark:bg-destructive/10 cursor-pointer hover:bg-destructive/10 dark:hover:bg-destructive/15"
        onClick={() => onClick?.(ghost)}
      >
        <TableCell colSpan={colSpan}>
          <div className="flex items-center gap-2 py-0.5">
            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
            <span className="text-xs font-medium text-foreground truncate">{ghost.fileName}</span>
            <span className="text-2xs text-destructive truncate">{ghost.errorMessage || 'Processing failed'}</span>
            <div className="flex-1" />
            {ghost.retryCount < MAX_RETRIES && onRetry && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-2xs px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(ghost.jobId);
                }}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Retry ({ghost.retryCount}/{MAX_RETRIES})
              </Button>
            )}
            {onDismiss && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(ghost.jobId);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  }

  // Processing state
  return (
    <TableRow className="pointer-events-none bg-muted/20 dark:bg-muted/10">
      <TableCell colSpan={colSpan}>
        <div className="flex items-center gap-2 py-0.5">
          <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin shrink-0" />
          <Badge variant="outline" className="text-2xs capitalize">
            Draft
          </Badge>
          <span className="text-xs text-foreground truncate">{ghost.fileName}</span>
          <span className="text-2xs text-muted-foreground">
            {isStaleWarning ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Taking longer than usual...
              </span>
            ) : (
              'Sally is processing...'
            )}
          </span>
          <div className="flex-1" />
          {/* Progress bar inline */}
          <div className="h-1 w-20 bg-muted rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-foreground/30 rounded-full animate-pulse" />
          </div>
          {isStaleAction && onCheckStatus && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-2xs px-2 pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                onCheckStatus(ghost.jobId);
              }}
            >
              Check Status
            </Button>
          )}
          {onCancel && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 pointer-events-auto"
              aria-label="Cancel import"
              title="Cancel import"
              onClick={(e) => {
                e.stopPropagation();
                // In-flight: X cancels the job server-side so it won't resurrect.
                onCancel(ghost.jobId);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
