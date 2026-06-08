'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { formatLoadLabel, JobStatus, LoadStatus } from '@sally/shared-types';
import { useRouter, useSearchParams } from 'next/navigation';
import { calendarDateToDate, dateToCalendarDate, DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { useEntityDeepLink } from '@/shared/hooks/use-entity-deep-link';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { useQueryClient } from '@tanstack/react-query';
import { STORAGE_KEYS, queryKeys } from '@/shared/constants';
import { useAuthStore } from '@/features/auth';
import { loadsApi, jobsApi } from '@/features/fleet/loads/api';
import type {
  LoadListItem,
  Load,
  CreateLoadInput as LoadCreate,
  CreateLoadStopInput as LoadStopCreate,
  LoadListFilters,
  LoadLegStatus,
} from '@/features/fleet/loads/types';
import { useDeleteLoad, useBoardLoads, useHistoryLoads } from '@/features/fleet/loads/hooks/use-loads';

import { CustomerPicker } from '@/features/fleet/customers/components/customer-picker';
import { CreateCustomerSheet } from '@/features/fleet/customers/components/create-customer-sheet';
import { JobsActivityPanel } from '@/features/fleet/loads/components/jobs-activity-panel';
import { RateconPreviewDialog } from '@/features/fleet/loads/components/ratecon-preview-dialog';
import { GhostImportCard } from '@/features/fleet/loads/components/ghost-import-card';
import { GHOST_IMPORT_STATUS, type GhostImport } from '@/features/fleet/loads/types/ratecon';
import { useRateconStream } from '@/features/fleet/documents/hooks/use-ratecon-stream';
import { useSseConnection } from '@/shared/realtime';
import { useReferenceData } from '@/features/platform/reference-data';
import { usePlan } from '@/features/platform/plans/hooks/use-plan';
import { LoadDetailPanel, EQUIPMENT_TYPES_FALLBACK } from '@/features/fleet/loads/components/LoadDetailPanel';
import { StopLocationPicker } from '@/features/fleet/stops/components/StopLocationPicker';
import { SmartAssignSheet } from '@/features/routing/smart-assign/components/SmartAssignSheet';
import { TripBadge } from '@/features/fleet/trips/components/TripBadge';
import { getTripColor } from '@/features/fleet/trips/utils';
import { CreateTripSheet } from '@/features/fleet/trips/components/CreateTripSheet';
import { TripSummarySheet } from '@/features/fleet/trips/components/TripSummarySheet';
import { ByTripView } from '@/features/fleet/trips/components/ByTripView';
import {
  PageHeader,
  ViewSwitcher,
  GroupSwitcher,
  PageActionsMenu,
  PageTabs,
  PageTabsList,
  PageTabsTrigger,
  TabsContent,
} from '@/shared/components/page-chrome';
import { PlanDetailPanel } from '@/features/routing/route-planning/components/PlanDetailPanel';
import { useRoutePlan } from '@/features/routing/route-planning/hooks/use-route-planning';
import type { ReferenceDataMap } from '@/features/platform/reference-data';
import { Button } from '@sally/ui/components/ui/button';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { SheetSizeControls } from '@/shared/components/ui/sheet-size-controls';
import { useSheetSizing, sizeModeToPixels } from '@/shared/hooks/use-sheet-sizing';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { CustomFieldsSection } from '@/features/fleet/custom-fields';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sally/ui/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Input } from '@sally/ui/components/ui/input';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Label } from '@sally/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sally/ui/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@sally/ui/components/ui/popover';
import { Calendar } from '@sally/ui/components/ui/calendar';
import {
  Plus,
  Trash2,
  Upload,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Search,
  CalendarIcon,
  MoreHorizontal,
  UserPlus,
  Route,
  Truck,
  Package,
  LayoutGrid,
  List,
  Layers,
  RotateCcw,
  RefreshCw,
  Activity,
  TrendingUp,
} from 'lucide-react';
import { TooltipProvider } from '@sally/ui/components/ui/tooltip';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { showSuccess, showError, toast as sonnerToast } from '@sally/ui';
import {
  LoadsTableView,
  LOADS_TABLE_COLUMN_DEFS,
  LOADS_TABLE_DEFAULT_COLUMNS,
} from '@/features/fleet/loads/components/LoadsTableView';
import { ColumnCustomizer } from '@/features/fleet/loads/components/ColumnCustomizer';
import { LoadStatusPivot, type LoadPivotValue } from '@/features/fleet/loads/components/LoadStatusPivot';
import { LanesTab } from '@/features/fleet/recurring-lanes/components/LanesTab';
import { CreateLaneSheet } from '@/features/fleet/recurring-lanes/components/CreateLaneSheet';
import { LaneDetailSheet } from '@/features/fleet/recurring-lanes/components/LaneDetailSheet';
import type { RecurringLane } from '@/features/fleet/recurring-lanes/types';
import { DateRangeFilter } from '@/shared/components/ui/date-range-filter';
import { RateLookupDialog } from '@/features/fleet/loads/components/RateLookupPopover';
import { BillingStatusBadge } from '@/features/financials/close-out/components/billing-status-badge';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useSensors,
  useSensor,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@sally/ui';
import { useLoadDragDrop, getTransition, dndAccessibility } from '@/features/fleet/loads/hooks/use-load-drag-drop';
import { KanbanDropZone } from '@/features/fleet/loads/components/KanbanDropZone';
import { DeliveredDropStrip } from '@/features/fleet/loads/components/DeliveredDropStrip';
import { RevertLoadDialog } from '@/features/fleet/loads/components/RevertLoadDialog';
import { LegStatusPill } from '@/features/fleet/loads/components/LegStatusPill';
import { useRelayEnabled } from '@/features/fleet/loads/hooks/use-load-legs';
import { RELAY_BADGE_CLASS } from '@/features/fleet/loads/constants/relay';
import { extractErrorMessage } from '@/shared/lib/error-utils';

// ============================================================================
// Main Page
// ============================================================================

export default function LoadsPage() {
  const loadSizing = useSheetSizing('load');
  const _router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated } = useAuthStore();
  const { data: refData } = useReferenceData(['equipment_type', 'us_state']);
  const { hasFeature } = usePlan();
  const docIntelEntitled = hasFeature('doc_intelligence');
  const queryClient = useQueryClient();
  const refetchLoads = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
  }, [queryClient]);

  // Manual refresh from the ⋯ More menu — refetch + visible confirmation (the silent
  // invalidate alone reads as "nothing happened").
  const handleManualRefresh = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: queryKeys.loads.root });
    showSuccess('Loads refreshed');
  }, [queryClient]);
  const deleteLoadMutation = useDeleteLoad();

  // SSE ratecon notifications
  useRateconStream({
    onCompleted: (data) => {
      refetchLoads();
      // Resolve ghost card if exists
      setGhostImports((prev) =>
        prev.map((g) =>
          g.jobId === data.jobId ? { ...g, status: GHOST_IMPORT_STATUS.COMPLETED, loadNumber: data.loadNumber } : g,
        ),
      );
      // Remove completed ghost after animation
      setTimeout(() => {
        setGhostImports((prev) => prev.filter((g) => g.jobId !== data.jobId));
      }, 1500);

      sonnerToast.success('Rate confirmation processed', {
        description: `Load #${data.loadNumber} created as draft`,
        action: {
          label: 'Review',
          onClick: () => {
            loadsApi
              .getById(data.loadNumber)
              .then((fullLoad) => {
                setSelectedLoad(fullLoad);
                setIsDetailOpen(true);
              })
              .catch(() => {});
          },
        },
      });
    },
    onFailed: (data) => {
      setGhostImports((prev) =>
        prev.map((g) =>
          g.jobId === data.jobId ? { ...g, status: GHOST_IMPORT_STATUS.FAILED, errorMessage: data.errorMessage } : g,
        ),
      );
      showError('Rate confirmation failed', `${data.fileName}: ${data.errorMessage}`);
    },
  });

  // Detail panel state
  const [selectedLoad, setSelectedLoad] = useState<Load | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailEditing, setIsDetailEditing] = useState(false);

  // Deep-link: ?open=<loadId>[&tab=docs] → auto-open detail sheet on a chosen
  // load-tab (used by command palette, notifications, factor-bundle dialog).
  // Note: a separate `tabParam` later in this file controls the page-level
  // view (loads/lanes/history); the detail-sheet tab is read from the same
  // ?tab= but consumed only when ?open= is also present.
  const openParam = searchParams.get('open');
  const loadDetailTabParam = searchParams.get('tab');
  const [deepLinkTab, setDeepLinkTab] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!openParam) return;
    loadsApi
      .getById(openParam)
      .then((fullLoad) => {
        setSelectedLoad(fullLoad);
        setDeepLinkTab(loadDetailTabParam || undefined);
        setIsDetailOpen(true);
        // Clean up URL without triggering navigation
        const url = new URL(window.location.href);
        url.searchParams.delete('open');
        url.searchParams.delete('tab');
        window.history.replaceState({}, '', url.toString());
      })
      .catch(() => {});
  }, [openParam, loadDetailTabParam]);

  // Generic entity deep-link: ?entityType=load&entityId=<loadId>
  useEntityDeepLink(
    useCallback(({ entityType, entityId }) => {
      if (entityType !== 'load') return;
      loadsApi
        .getById(entityId)
        .then((fullLoad) => {
          setSelectedLoad(fullLoad);
          setIsDetailOpen(true);
        })
        .catch(() => {});
    }, []),
  );

  // New load dialog
  const [isNewLoadOpen, setIsNewLoadOpen] = useState(false);
  const [pendingJobIds] = useState<number[]>([]);

  // Ghost import cards for rate-con preview flow
  const [ghostImports, setGhostImports] = useState<GhostImport[]>([]);
  // Mirror of ghostImports for optimistic-restore in cancel without adding the
  // whole list to the cancel callback's dep array (stable handler identity).
  const ghostImportsRef = useRef<GhostImport[]>([]);
  useEffect(() => {
    ghostImportsRef.current = ghostImports;
  }, [ghostImports]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const reconcileGhosts = useCallback(async () => {
    try {
      const [activeResult, failedResult] = await Promise.all([
        jobsApi.list({
          category: 'documents',
          type: 'ratecon',
          status: [JobStatus.QUEUED, JobStatus.PROCESSING],
          dismissed: false,
        }),
        jobsApi.list({
          category: 'documents',
          type: 'ratecon',
          status: [JobStatus.FAILED],
          dismissed: false,
          limit: 10,
        }),
      ]);

      const activeJobIds = new Set(activeResult.items.map((j) => j.id));
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      const recentFailed = failedResult.items.filter((j) => new Date(j.createdAt) > thirtyMinAgo);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileNameOf = (j: { inputData?: unknown }) => (j.inputData as any)?.fileName || 'Unknown file';

      setGhostImports((prev) => {
        const knownIds = new Set(prev.map((g) => g.jobId));

        // 1. Prune stranded 'processing' ghosts whose job is no longer active.
        const pruned = prev.filter((g) => g.status !== GHOST_IMPORT_STATUS.PROCESSING || activeJobIds.has(g.jobId));

        // 2. Add server-side processing/failed jobs we aren't already tracking.
        const additions: GhostImport[] = [
          ...activeResult.items
            .filter((j) => !knownIds.has(j.id))
            .map((j) => ({
              jobId: j.id,
              fileName: fileNameOf(j),
              startedAt: new Date(j.startedAt || j.createdAt),
              status: GHOST_IMPORT_STATUS.PROCESSING,
              retryCount: 0,
            })),
          ...recentFailed
            .filter((j) => !knownIds.has(j.id))
            .map((j) => ({
              jobId: j.id,
              fileName: fileNameOf(j),
              startedAt: new Date(j.startedAt || j.createdAt),
              status: GHOST_IMPORT_STATUS.FAILED,
              errorMessage: j.errorMessage,
              retryCount: 0,
            })),
        ];

        if (pruned.length === prev.length && additions.length === 0) return prev;
        return [...additions, ...pruned];
      });
    } catch {
      // Non-critical — ghosts are a UI convenience.
    }
  }, []);

  // Reconcile on mount and whenever the SSE connection (re)opens — a reconnect
  // is exactly when we may have missed a completion event.
  const { status: sseStatus } = useSseConnection();
  useEffect(() => {
    if (sseStatus === 'open') reconcileGhosts();
  }, [sseStatus, reconcileGhosts]);

  // Handle ?action= query param (create, import-ratecon)
  const actionParam = searchParams.get('action');
  useEffect(() => {
    if (!actionParam) return;
    if (actionParam === 'create') {
      setIsNewLoadOpen(true);
    } else if (actionParam === 'import-ratecon') {
      setIsPreviewOpen(true);
    }
    // Clean up URL
    const url = new URL(window.location.href);
    url.searchParams.delete('action');
    window.history.replaceState({}, '', url.toString());
  }, [actionParam]);

  // Derive completed/failed job sets for the preview dialog from ghost state
  const completedJobIds = useMemo(
    () => new Set(ghostImports.filter((g) => g.status === GHOST_IMPORT_STATUS.COMPLETED).map((g) => g.jobId)),
    [ghostImports],
  );
  const failedJobs = useMemo(
    () =>
      new Map(
        ghostImports
          .filter((g) => g.status === GHOST_IMPORT_STATUS.FAILED)
          .map((g) => [g.jobId, g.errorMessage || 'Failed']),
      ),
    [ghostImports],
  );

  // Smart assign sheet
  const [assignSheetLoadId, setAssignSheetLoadId] = useState<string | null>(null);
  const [assignSheetLoadData, setAssignSheetLoadData] = useState<{
    loadNumber: string;
    referenceNumber?: string;
    loadRoute: string;
    loadMiles: number;
    loadEquipmentType: string;
    pickupDate?: string;
    rate?: string;
    weight?: string;
  } | null>(null);

  const openAssignSheet = (load: LoadListItem) => {
    setAssignSheetLoadId(load.loadNumber);
    setAssignSheetLoadData({
      loadNumber: load.loadNumber,
      referenceNumber: load.referenceNumber || undefined,
      loadRoute:
        load.originCity && load.destinationCity
          ? `${load.originCity}, ${load.originState || ''} → ${load.destinationCity}, ${load.destinationState || ''}`
          : '',
      loadMiles: 0, // estimatedMiles not on LoadListItem; route generation calculates from stops
      loadEquipmentType: load.requiredEquipmentType || '',
      pickupDate: load.pickupDate ?? undefined,
      rate: load.rateCents ? `$${(load.rateCents / 100).toLocaleString()}` : undefined,
      weight: load.weightLbs ? `${load.weightLbs.toLocaleString()} lbs` : undefined,
    });
  };

  // View Smart Route sheet
  const [viewPlanId, setViewPlanId] = useState<string | null>(null);
  const { data: viewPlanData } = useRoutePlan(viewPlanId);

  const [revertDialogLoad, setRevertDialogLoad] = useState<LoadListItem | null>(null);

  // Delete draft confirmation
  const [deleteConfirmLoad, setDeleteConfirmLoad] = useState<LoadListItem | null>(null);

  // Reason dialog for on_hold / tonu / cancelled transitions
  const [reasonDialog, setReasonDialog] = useState<{
    loadId: string;
    status: 'ON_HOLD' | 'TONU' | 'CANCELLED';
    title: string;
    description: string;
    actionLabel: string;
    reasonRequired?: boolean;
  } | null>(null);
  const [reasonText, setReasonText] = useState('');

  // Top-level view: loads vs customers (like Fleet has Drivers | Assets)
  const tabParam = searchParams.get('tab');
  const [createLaneOpen, setCreateLaneOpen] = useState(false);
  const [editLane, setEditLane] = useState<RecurringLane | null>(null);
  const [viewLane, setViewLane] = useState<RecurringLane | null>(null);
  const [viewLaneOpen, setViewLaneOpen] = useState(false);
  const [activeView, setActiveView] = useState<'loads' | 'lanes'>(tabParam === 'lanes' ? 'lanes' : 'loads');

  // View layout (how loads are drawn) and grouping (how they're clustered) are two
  // separate axes. Trip grouping (formerly the "Convoy" view) is no longer a third
  // layout — it's a Group control that overlays the Board/Table layout. Legacy
  // persisted value 'convoy' migrates to layout='status' + group='trip'.
  const [boardLayout, setBoardLayout] = useState<'status' | 'table'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEYS.LOADS_VIEW_MODE);
      if (stored === 'table') return 'table';
    }
    return 'status';
  });
  const [boardGroup, setBoardGroup] = useState<'none' | 'trip'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEYS.LOADS_VIEW_MODE);
      if (stored === 'convoy') return 'trip';
    }
    return 'none';
  });

  // Table column visibility — hosted in the filter row so the customizer sits with the
  // other view controls (Board/Table/Group) instead of floating on its own line.
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.LOADS_TABLE_COLUMNS);
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) return new Set(parsed as string[]);
      } catch {
        /* fall through to defaults */
      }
    }
    return new Set(LOADS_TABLE_DEFAULT_COLUMNS);
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LOADS_TABLE_COLUMNS, JSON.stringify([...visibleColumnKeys]));
  }, [visibleColumnKeys]);
  const toggleColumn = useCallback((key: string) => {
    setVisibleColumnKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const resetColumns = useCallback(() => setVisibleColumnKeys(new Set(LOADS_TABLE_DEFAULT_COLUMNS)), []);

  // Toolbar overflow dialogs (opened from the ⋯ More menu)
  const [rateLookupOpen, setRateLookupOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activeJobCount, setActiveJobCount] = useState(0);

  // Auto-open the Activity dialog when a new background job is queued (e.g. ratecon import).
  useEffect(() => {
    if (pendingJobIds && pendingJobIds.length > 0) setActivityOpen(true);
  }, [pendingJobIds]);

  // Trip multi-select state — stores full load data so it works across both kanban and table views
  const [selectedLoadIds, setSelectedLoadIds] = useState<Set<string>>(new Set());
  const [selectedLoadMap, setSelectedLoadMap] = useState<Map<string, LoadListItem>>(new Map());
  const [isCreateTripOpen, setIsCreateTripOpen] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const inSelectionMode = selectedLoadIds.size > 0;

  const toggleLoadSelection = useCallback((loadId: string, loadData?: LoadListItem) => {
    setSelectedLoadIds((prev) => {
      const next = new Set(prev);
      if (next.has(loadId)) {
        next.delete(loadId);
        setSelectedLoadMap((m) => {
          const nm = new Map(m);
          nm.delete(loadId);
          return nm;
        });
      } else {
        next.add(loadId);
        if (loadData) {
          setSelectedLoadMap((m) => new Map(m).set(loadId, loadData));
        }
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedLoadIds(new Set());
    setSelectedLoadMap(new Map());
  }, []);

  const selectedLoadsForTrip = useMemo(() => Array.from(selectedLoadMap.values()), [selectedLoadMap]);

  useEffect(() => {
    // Persist the combined view+group as a single mode for back-compat with the
    // legacy 'status' | 'table' | 'convoy' key. Trip grouping wins the persisted slot.
    const persisted = boardGroup === 'trip' ? 'convoy' : boardLayout;
    localStorage.setItem(STORAGE_KEYS.LOADS_VIEW_MODE, persisted);
  }, [boardLayout, boardGroup]);

  // New customer sheet
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);

  // One shared search box drives the active board (client-side filter) OR history (server filter).
  const [searchQuery, setSearchQuery] = useState('');

  // Status pivot — single scope control for the filter row. Active-status values filter
  // the board/table; 'HISTORY' switches to the history data source (and forces Table).
  const [statusPivot, setStatusPivot] = useState<LoadPivotValue>(tabParam === 'history' ? 'HISTORY' : 'ALL');
  const isHistory = statusPivot === 'HISTORY';

  // Active board: full set from /loads/board, single source of truth for kanban + table
  const {
    data: boardData,
    isLoading,
    error: boardError,
  } = useBoardLoads({
    enabled: isAuthenticated && user?.role !== 'DRIVER',
  });
  const loads = useMemo(() => boardData?.data ?? [], [boardData]);
  const error = boardError instanceof Error ? boardError.message : null;

  // When the loads board refetches (e.g. the imported draft lands via the
  // LOAD_CREATED SSE invalidation), reconcile ghosts. This is the direct
  // backstop for "load appeared but the processing card is still showing": the
  // load and the ghost are driven by separate events, so a missed
  // RATECON_COMPLETED would otherwise strand the card until a manual refresh.
  // Skipped while a fetch is in flight so we reconcile against settled data.
  useEffect(() => {
    if (!boardData || isLoading) return;
    if (ghostImportsRef.current.some((g) => g.status === GHOST_IMPORT_STATUS.PROCESSING)) {
      reconcileGhosts();
    }
  }, [boardData, isLoading, reconcileGhosts]);

  // History tab filters (delivered + cancelled, default 30-day range)
  const [historyFilters, setHistoryFilters] = useState<LoadListFilters>(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const toStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      status: `${LoadStatus.DELIVERED},${LoadStatus.CANCELLED}`,
      dateFrom: toStr(thirtyDaysAgo),
      dateTo: toStr(today),
      limit: 20,
      offset: 0,
    };
  });
  // History query — only fires when History is the active pivot. Mutation invalidations
  // on `queryKeys.loads.root` keep it fresh once it's been loaded.
  const { data: historyData } = useHistoryLoads(historyFilters, {
    enabled: isAuthenticated && user?.role !== 'DRIVER' && isHistory,
  });
  const historyLoads = historyData?.data ?? [];
  const historyTotal = historyData?.total ?? 0;

  // Push the shared search into the history (server-side) query while History is active.
  useEffect(() => {
    if (!isHistory) return;
    setHistoryFilters((f) => ({ ...f, search: searchQuery || undefined, offset: 0 }));
  }, [isHistory, searchQuery]);

  // Group loads by status
  // Post-route lifecycle: pending → assigned → in_transit → delivered
  // "planned" is NOT a load status — a load on a draft route plan is still pending
  const activeLoads = useMemo(() => {
    if (!searchQuery.trim()) return loads;
    const q = searchQuery.toLowerCase();
    return loads.filter(
      (l) =>
        l.loadNumber?.toLowerCase().includes(q) ||
        l.customerName?.toLowerCase().includes(q) ||
        l.referenceNumber?.toLowerCase().includes(q) ||
        l.driverName?.toLowerCase().includes(q) ||
        l.vehicleUnitNumber?.toLowerCase().includes(q),
    );
  }, [loads, searchQuery]);

  const drafts = activeLoads.filter((l) => l.status === 'DRAFT');
  const pending = activeLoads.filter((l) => l.status === 'PENDING');
  const assigned = activeLoads.filter((l) => l.status === 'ASSIGNED');
  const inTransit = activeLoads.filter((l) => l.status === 'IN_TRANSIT');
  const onHold = activeLoads.filter((l) => l.status === 'ON_HOLD');

  // Live counts for the status pivot (unfiltered active board + history total).
  const pivotCounts = useMemo<Partial<Record<LoadPivotValue, number>>>(
    () => ({
      ALL: loads.length,
      DRAFT: loads.filter((l) => l.status === 'DRAFT').length,
      PENDING: loads.filter((l) => l.status === 'PENDING').length,
      ASSIGNED: loads.filter((l) => l.status === 'ASSIGNED').length,
      IN_TRANSIT: loads.filter((l) => l.status === 'IN_TRANSIT').length,
      ON_HOLD: loads.filter((l) => l.status === 'ON_HOLD').length,
      HISTORY: historyTotal,
    }),
    [loads, historyTotal],
  );

  // The kanban always shows every column — its columns ARE the statuses, so the pivot
  // pills act as live counts on the board and only filter rows in Table view. Picking a
  // specific status switches to Table (where that filter is meaningful).
  const handlePivotChange = useCallback((value: LoadPivotValue) => {
    setStatusPivot(value);
    if (value !== 'ALL' && value !== 'HISTORY') setBoardLayout('table');
  }, []);

  // The board shows all columns, so a specific status pivot can't be honored there.
  // Switching to Board resets the pivot to Active so the pill always reflects what's shown.
  const handleLayoutChange = useCallback((value: 'status' | 'table') => {
    setBoardLayout(value);
    if (value === 'status') setStatusPivot((prev) => (prev === 'HISTORY' ? prev : 'ALL'));
  }, []);

  // Dismiss a FINISHED (failed) card — hides it locally and flags the job row
  // dismissed so hydration won't bring it back. Does NOT touch a live job.
  const handleGhostDismiss = useCallback(async (jobId: number) => {
    setGhostImports((prev) => prev.filter((g) => g.jobId !== jobId));
    try {
      await jobsApi.dismiss(jobId);
    } catch (err) {
      showError('Could not dismiss import', extractErrorMessage(err));
    }
  }, []);

  // Cancel an IN-FLIGHT (processing/queued) job — stops it server-side
  // (DELETE /jobs/:id removes the BullMQ job + marks the row CANCELLED) so the
  // card doesn't resurrect on the next page load. Optimistically remove, restore
  // on failure.
  const handleGhostCancel = useCallback(async (jobId: number) => {
    const previous = ghostImportsRef.current;
    setGhostImports((prev) => prev.filter((g) => g.jobId !== jobId));
    try {
      await jobsApi.cancel(jobId);
      showSuccess('Import cancelled');
    } catch (err) {
      setGhostImports(previous);
      showError('Could not cancel import', extractErrorMessage(err));
    }
  }, []);

  const handleGhostRetry = useCallback(async (jobId: number) => {
    setGhostImports((prev) =>
      prev.map((g) =>
        g.jobId === jobId
          ? {
              ...g,
              status: GHOST_IMPORT_STATUS.PROCESSING,
              errorMessage: undefined,
              retryCount: g.retryCount + 1,
              startedAt: new Date(),
            }
          : g,
      ),
    );
    try {
      await jobsApi.retry(jobId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Retry failed';
      setGhostImports((prev) =>
        prev.map((g) => (g.jobId === jobId ? { ...g, status: GHOST_IMPORT_STATUS.FAILED, errorMessage: message } : g)),
      );
    }
  }, []);

  const handleGhostCheckStatus = useCallback(
    async (jobId: number) => {
      try {
        const job = await jobsApi.get(jobId);
        if (job.status === JobStatus.COMPLETED && job.resultData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const resultData = job.resultData as any;
          setGhostImports((prev) =>
            prev.map((g) =>
              g.jobId === jobId
                ? { ...g, status: GHOST_IMPORT_STATUS.COMPLETED, loadNumber: resultData.loadNumber }
                : g,
            ),
          );
          refetchLoads();
          setTimeout(() => {
            setGhostImports((prev) => prev.filter((g) => g.jobId !== jobId));
          }, 1500);
        } else if (job.status === JobStatus.FAILED) {
          setGhostImports((prev) =>
            prev.map((g) =>
              g.jobId === jobId
                ? { ...g, status: GHOST_IMPORT_STATUS.FAILED, errorMessage: job.errorMessage || 'Processing failed' }
                : g,
            ),
          );
        } else if (job.status === JobStatus.CANCELLED) {
          // Job was cancelled elsewhere — drop the card; it won't rehydrate.
          setGhostImports((prev) => prev.filter((g) => g.jobId !== jobId));
        } else {
          // Still QUEUED/PROCESSING — the card was stuck and Check Status used to
          // do nothing. Tell the dispatcher it's genuinely still working so the
          // button is never a dead end.
          showSuccess('Still processing — Sally is working on this import.');
        }
      } catch {
        showError('Could not check job status');
      }
    },
    [refetchLoads],
  );

  const handleGhostClick = useCallback((ghost: GhostImport) => {
    showError('Import failed', ghost.errorMessage || 'Processing failed');
  }, []);

  // DnD sensors: mouse (5px activation), touch (200ms delay), keyboard
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  );

  const { dragState, pendingMutation, handleDragStart, handleDragEnd, handleDragCancel, shouldSuppressClick } =
    useLoadDragDrop({
      loads,
      updateStatusApi: (loadId, status) => loadsApi.updateStatus(loadId, status),
      advanceLegStatusApi: (loadId, legId, status) =>
        loadsApi.advanceLegStatus(loadId, legId, { status: status as LoadLegStatus }),
      onAssignDriver: (load) => openAssignSheet(load),
      onRevertStatus: (load) => setRevertDialogLoad(load),
    });

  const handleCardClick = async (loadListItem: LoadListItem) => {
    try {
      const fullLoad = await loadsApi.getById(loadListItem.loadNumber);
      setSelectedLoad(fullLoad);
      setIsDetailOpen(true);
    } catch {
      // silent fail — toast would be better
    }
  };

  // Open the load detail by number alone — used by the By-Trip view, whose loads
  // are sourced from the trips API and may not exist in the board `loads` array.
  const handleLoadClickByNumber = async (loadNumber: string) => {
    try {
      const fullLoad = await loadsApi.getById(loadNumber);
      setSelectedLoad(fullLoad);
      setIsDetailOpen(true);
    } catch {
      // silent fail — toast would be better
    }
  };

  const handleStatusChange = async (loadId: string, status: string, reason?: string) => {
    // Intercept on_hold/tonu/cancelled: open reason/confirmation dialog if no reason provided
    if ((status === 'ON_HOLD' || status === 'TONU' || status === 'CANCELLED') && !reason) {
      setReasonDialog({
        loadId,
        status: status as 'ON_HOLD' | 'TONU' | 'CANCELLED',
        title: status === 'ON_HOLD' ? 'Place Load On Hold' : status === 'TONU' ? 'Mark as TONU' : 'Cancel Load',
        description:
          status === 'ON_HOLD'
            ? 'Please provide a reason for placing this load on hold.'
            : status === 'TONU'
              ? 'Please provide a reason for marking this load as TONU (Truck Ordered Not Used).'
              : 'Are you sure you want to cancel this load? This action cannot be easily undone. Optionally provide a reason.',
        actionLabel: status === 'ON_HOLD' ? 'Place On Hold' : status === 'TONU' ? 'Mark TONU' : 'Cancel Load',
        reasonRequired: status !== 'CANCELLED',
      });
      return;
    }
    try {
      await loadsApi.updateStatus(loadId, status, reason);
      await refetchLoads();
      if (selectedLoad?.loadNumber === loadId) {
        const updated = await loadsApi.getById(loadId);
        setSelectedLoad(updated);
      }
    } catch (err) {
      showError('Status update failed', extractErrorMessage(err));
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSaveDraft = async (loadId: string, data: any) => {
    try {
      const updated = await loadsApi.updateDraft(loadId, data);
      setSelectedLoad(updated);
      await refetchLoads();
      showSuccess('Load saved');
    } catch (err) {
      showError('Save failed', extractErrorMessage(err));
    }
  };

  const handleDuplicate = async (loadId: string) => {
    try {
      const _newLoad = await loadsApi.duplicate(loadId);
      await refetchLoads();
      showSuccess('Load duplicated');
    } catch {
      showError('Duplicate failed', 'Could not duplicate load');
    }
  };

  const handleCopyTrackingLink = async (loadId: string) => {
    try {
      const result = await loadsApi.generateTrackingToken(loadId);
      const url = `${window.location.origin}/track/${result.trackingToken}`;
      await navigator.clipboard.writeText(url);
      showSuccess('Tracking link copied to clipboard');
    } catch {
      showError('Failed', 'Could not generate tracking link');
    }
  };

  const handleCreateSuccess = async () => {
    setIsNewLoadOpen(false);
    await refetchLoads();
  };

  if (!isAuthenticated || user?.role === 'DRIVER') {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Page identity */}
        <div className="pt-1">
          <PageHeader title="Loads" subtitle="Every load, from tender to delivered" hasTabs />
        </div>
        {/* Primary tabs — top-level navigation (underline PageTabs, like every page) */}
        <PageTabs
          value={activeView}
          onValueChange={(v) => setActiveView(v as 'loads' | 'lanes')}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-2 py-3 border-b border-border">
            <PageTabsList>
              <PageTabsTrigger value="loads">Loads</PageTabsTrigger>
              <PageTabsTrigger value="lanes">Lanes</PageTabsTrigger>
            </PageTabsList>
            <div className="flex items-center gap-2">
              {activeView === 'loads' && (
                <>
                  {/* Adaptive: live Activity indicator surfaces only when jobs are running */}
                  {activeJobCount > 0 && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="relative h-8 w-8"
                      onClick={() => setActivityOpen(true)}
                      title="Processing activity"
                    >
                      <Activity className="h-4 w-4" />
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-2xs font-medium text-background">
                        {activeJobCount}
                      </span>
                    </Button>
                  )}
                  {/* 2° CTA */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={docIntelEntitled ? () => setIsPreviewOpen(true) : undefined}
                    disabled={!docIntelEntitled}
                    title={!docIntelEntitled ? 'Requires Fleet plan' : 'Import rate confirmation PDF'}
                  >
                    <Upload className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Import</span>
                    {!docIntelEntitled && <Sparkles className="h-3 w-3 ml-1 text-muted-foreground" />}
                  </Button>
                  {/* 1° CTA */}
                  <Button size="sm" onClick={() => setIsNewLoadOpen(true)}>
                    <Plus className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">New Load</span>
                  </Button>
                  {/* ⋯ More — secondary tools + simple actions */}
                  <PageActionsMenu
                    items={[
                      { label: 'Rate lookup', icon: TrendingUp, onClick: () => setRateLookupOpen(true) },
                      { label: 'Processing activity', icon: Activity, onClick: () => setActivityOpen(true) },
                      { label: 'Refresh loads', icon: RefreshCw, onClick: handleManualRefresh },
                    ]}
                  />
                </>
              )}
              {activeView === 'lanes' && (
                <Button size="sm" onClick={() => setCreateLaneOpen(true)}>
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">New Lane</span>
                </Button>
              )}
              {(activeView as string) === 'customers' && (
                <Button size="sm" onClick={() => setIsNewCustomerOpen(true)}>
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Add Customer</span>
                </Button>
              )}
            </div>
          </div>

          {/* ── Loads View ── */}
          <TabsContent value="loads" className="flex-1 flex flex-col min-h-0 mt-0">
            {error ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="text-center">
                  <p className="text-critical mb-4">{error}</p>
                  <Button onClick={refetchLoads}>Retry</Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Filter row (Zone 3): status pivot · search · view · group (+ date on History) */}
                <div className="flex flex-col gap-2 pt-3 pb-2 lg:flex-row lg:items-center">
                  <LoadStatusPivot value={statusPivot} onChange={handlePivotChange} counts={pivotCounts} />
                  <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search loads, customers, drivers, references..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 w-full pl-9 text-xs sm:w-72"
                      />
                    </div>
                    {isHistory ? (
                      <DateRangeFilter
                        dateFrom={historyFilters.dateFrom}
                        dateTo={historyFilters.dateTo}
                        defaultPreset="30d"
                        onChange={(from, to) =>
                          setHistoryFilters((f) => ({ ...f, dateFrom: from, dateTo: to, offset: 0 }))
                        }
                      />
                    ) : (
                      <>
                        <ViewSwitcher
                          value={boardLayout}
                          onChange={handleLayoutChange}
                          options={[
                            { value: 'status', label: 'Board', icon: LayoutGrid },
                            { value: 'table', label: 'Table', icon: List },
                          ]}
                        />
                        <GroupSwitcher
                          value={boardGroup}
                          onChange={setBoardGroup}
                          options={[
                            { value: 'none', label: 'None', icon: List },
                            { value: 'trip', label: 'By Trip', icon: Layers },
                          ]}
                        />
                        {boardLayout === 'table' && boardGroup !== 'trip' && (
                          <ColumnCustomizer
                            columns={LOADS_TABLE_COLUMN_DEFS}
                            visibleKeys={visibleColumnKeys}
                            onToggle={toggleColumn}
                            onReset={resetColumns}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* History → always a table (delivered loads have no kanban lifecycle) */}
                {isHistory ? (
                  <div className="flex-1 space-y-4 overflow-auto px-px pt-1">
                    <LoadsTable
                      loads={historyLoads}
                      onRowClick={handleCardClick}
                      emptyMessage="No loads found"
                      refData={refData}
                      showBillingStatus
                      showStatus
                    />
                    <PaginationControls
                      offset={historyFilters.offset || 0}
                      limit={historyFilters.limit || 20}
                      count={historyTotal}
                      onChange={(offset) => setHistoryFilters((f) => ({ ...f, offset }))}
                    />
                  </div>
                ) : boardGroup === 'trip' ? (
                  <ByTripView search={searchQuery} onTripClick={(tripId) => setSelectedTripId(tripId)} />
                ) : boardLayout === 'table' ? (
                  <LoadsTableView
                    statusFilter={statusPivot === 'ALL' ? undefined : statusPivot}
                    search={searchQuery}
                    visibleColumnKeys={visibleColumnKeys}
                    onLoadClick={handleCardClick}
                    selectedLoadIds={selectedLoadIds}
                    onToggleSelect={toggleLoadSelection}
                    ghostImports={ghostImports}
                    onGhostDismiss={handleGhostDismiss}
                    onGhostCancel={handleGhostCancel}
                    onGhostRetry={handleGhostRetry}
                    onGhostCheckStatus={handleGhostCheckStatus}
                    onGhostClick={handleGhostClick}
                  />
                ) : (
                  <div className="flex-1 pb-4 md:pb-6 overflow-auto">
                    {isLoading ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 h-full min-h-[400px]">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div key={i} className="space-y-3">
                            <Skeleton className="h-8 w-24" />
                            {Array.from({ length: 3 }).map((_, j) => (
                              <Skeleton key={j} className="h-24 w-full rounded-lg" />
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <DndContext
                        sensors={sensors}
                        accessibility={dndAccessibility}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDragCancel={handleDragCancel}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 h-full min-h-[400px]">
                          <KanbanColumn
                            title="Drafts"
                            status="DRAFT"
                            count={drafts.length}
                            loads={drafts}
                            dragState={dragState}
                            pendingMutation={pendingMutation}
                            shouldSuppressClick={shouldSuppressClick}
                            onCardClick={handleCardClick}
                            onStatusChange={(load, status) => handleStatusChange(load.loadNumber, status)}
                            onDelete={(load) => setDeleteConfirmLoad(load)}
                            ghostImports={ghostImports}
                            onGhostDismiss={handleGhostDismiss}
                            onGhostCancel={handleGhostCancel}
                            onGhostRetry={handleGhostRetry}
                            onGhostCheckStatus={handleGhostCheckStatus}
                            onGhostClick={handleGhostClick}
                            selectedLoadIds={selectedLoadIds}
                            inSelectionMode={inSelectionMode}
                            onToggleSelect={toggleLoadSelection}
                            onTripClick={(id) => setSelectedTripId(id)}
                          />
                          <KanbanColumn
                            title="Pending"
                            status="PENDING"
                            count={pending.length}
                            loads={pending}
                            dragState={dragState}
                            pendingMutation={pendingMutation}
                            shouldSuppressClick={shouldSuppressClick}
                            onCardClick={handleCardClick}
                            onAssign={(load) => openAssignSheet(load)}
                            onStatusChange={(load, status) => handleStatusChange(load.loadNumber, status)}
                            selectedLoadIds={selectedLoadIds}
                            inSelectionMode={inSelectionMode}
                            onToggleSelect={toggleLoadSelection}
                            onTripClick={(id) => setSelectedTripId(id)}
                          />
                          <KanbanColumn
                            title="Assigned"
                            status="ASSIGNED"
                            count={assigned.length}
                            loads={assigned}
                            dragState={dragState}
                            pendingMutation={pendingMutation}
                            shouldSuppressClick={shouldSuppressClick}
                            onCardClick={handleCardClick}
                            onStatusChange={(load, status) => handleStatusChange(load.loadNumber, status)}
                            onDuplicate={(load) => handleDuplicate(load.loadNumber)}
                            onCopyTrackingLink={(load) => handleCopyTrackingLink(load.loadNumber)}
                            onViewPlan={(planId) => setViewPlanId(planId)}
                            onTripClick={(id) => setSelectedTripId(id)}
                          />
                          <KanbanColumn
                            title="In Transit"
                            status="IN_TRANSIT"
                            count={inTransit.length}
                            loads={inTransit}
                            dragState={dragState}
                            pendingMutation={pendingMutation}
                            shouldSuppressClick={shouldSuppressClick}
                            onCardClick={handleCardClick}
                            onStatusChange={(load, status) => handleStatusChange(load.loadNumber, status)}
                            onDuplicate={(load) => handleDuplicate(load.loadNumber)}
                            onViewPlan={(planId) => setViewPlanId(planId)}
                            onCopyTrackingLink={(load) => handleCopyTrackingLink(load.loadNumber)}
                            onRevertStatus={(load) => setRevertDialogLoad(load)}
                            onTripClick={(id) => setSelectedTripId(id)}
                          />
                          {onHold.length > 0 && (
                            <KanbanColumn
                              title="On Hold"
                              status="ON_HOLD"
                              count={onHold.length}
                              loads={onHold}
                              dragState={dragState}
                              pendingMutation={pendingMutation}
                              shouldSuppressClick={shouldSuppressClick}
                              onCardClick={handleCardClick}
                              onStatusChange={(load, status) => handleStatusChange(load.loadNumber, status)}
                              onTripClick={(id) => setSelectedTripId(id)}
                            />
                          )}
                        </div>

                        <DeliveredDropStrip
                          visible={dragState.activeSourceStatus === 'IN_TRANSIT'}
                          relayLegSequence={
                            dragState.activeLoad?.isRelay ? dragState.activeLoad.activeLeg?.sequence : undefined
                          }
                          isRelayMidLeg={
                            dragState.activeLoad?.isRelay === true &&
                            !!dragState.activeLoad.activeLeg &&
                            dragState.activeLoad.activeLeg.status !== 'DELIVERED'
                          }
                        />

                        <DragOverlay>
                          {dragState.activeLoad ? (
                            <div className="opacity-90 scale-[1.02] shadow-xl rounded-lg">
                              <LoadCard load={dragState.activeLoad} isDragDisabled onClick={() => {}} />
                            </div>
                          ) : null}
                        </DragOverlay>
                      </DndContext>
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── Lanes View ── */}
          <TabsContent value="lanes" className="flex-1 flex flex-col min-h-0 mt-0">
            <LanesTab
              onCreateLane={() => setCreateLaneOpen(true)}
              onEditLane={(lane) => {
                setEditLane(lane);
                setCreateLaneOpen(true);
              }}
              onViewLane={(lane) => {
                setViewLane(lane);
                setViewLaneOpen(true);
              }}
            />
          </TabsContent>
        </PageTabs>

        {/* Detail slide-out panel */}
        <Sheet
          open={isDetailOpen}
          onOpenChange={(open) => {
            if (!open) setIsDetailEditing(false);
            setIsDetailOpen(open);
          }}
        >
          <SheetContent
            className="w-full p-0 flex flex-col"
            onInteractOutside={(e) => {
              if (isDetailEditing || selectedLoad?.status === 'DRAFT') e.preventDefault();
            }}
            pinnable
            resizable
            defaultWidth={sizeModeToPixels(loadSizing.effectiveSize)}
            defaultPinned={isDetailEditing || selectedLoad?.status === 'DRAFT'}
          >
            {selectedLoad && (
              <LoadDetailPanel
                load={selectedLoad}
                onStatusChange={handleStatusChange}
                onSaveDraft={handleSaveDraft}
                onDuplicate={handleDuplicate}
                onCopyTrackingLink={handleCopyTrackingLink}
                onEditingChange={setIsDetailEditing}
                defaultTab={deepLinkTab}
                headerExtra={loadSizing.showControls ? <SheetSizeControls entityType="load" allowFull /> : undefined}
                onAssign={(loadId) => {
                  const listItem = loads.find((l) => l.loadNumber === loadId);
                  if (listItem) {
                    openAssignSheet(listItem);
                  } else if (selectedLoad?.loadNumber === loadId) {
                    // fallback: construct minimal LoadListItem from full load
                    openAssignSheet({
                      id: selectedLoad.id,
                      loadNumber: selectedLoad.loadNumber,
                      status: selectedLoad.status,
                      customerName: selectedLoad.customerName ?? '',
                      stopCount: selectedLoad.stopCount ?? selectedLoad.stops?.length ?? 0,
                      weightLbs: selectedLoad.weightLbs,
                      commodityType: selectedLoad.commodityType,
                      requiredEquipmentType: selectedLoad.requiredEquipmentType,
                      rateCents: selectedLoad.rateCents,
                      pickupDate: selectedLoad.stops?.[0]?.appointmentDate ?? undefined,
                      originCity: selectedLoad.stops?.[0]?.stopCity ?? undefined,
                      originState: selectedLoad.stops?.[0]?.stopState ?? undefined,
                      destinationCity: selectedLoad.stops?.[selectedLoad.stops.length - 1]?.stopCity ?? undefined,
                      destinationState: selectedLoad.stops?.[selectedLoad.stops.length - 1]?.stopState ?? undefined,
                    });
                  }
                }}
                onDelete={(loadId) => {
                  const listItem = loads.find((l) => l.loadNumber === loadId);
                  if (listItem) setDeleteConfirmLoad(listItem);
                }}
                refData={refData}
                onViewTrip={(tripId) => {
                  setIsDetailOpen(false);
                  setSelectedTripId(tripId);
                }}
              />
            )}
          </SheetContent>
        </Sheet>

        {/* View Lane Detail Sheet */}
        <LaneDetailSheet
          open={viewLaneOpen}
          onOpenChange={(open) => {
            setViewLaneOpen(open);
            if (!open) setViewLane(null);
          }}
          lane={viewLane}
        />

        {/* Create/Edit Lane Sheet */}
        <CreateLaneSheet
          open={createLaneOpen}
          onOpenChange={(open) => {
            setCreateLaneOpen(open);
            if (!open) setEditLane(null);
          }}
          editLane={editLane}
        />

        {/* Create Load sheet */}
        <FormSheet
          open={isNewLoadOpen}
          onOpenChange={setIsNewLoadOpen}
          title="Create Load"
          mode="edit"
          entityType="load"
        >
          <NewLoadForm onSuccess={handleCreateSuccess} onCancel={() => setIsNewLoadOpen(false)} refData={refData} />
        </FormSheet>

        {/* New customer sheet */}
        <CreateCustomerSheet open={isNewCustomerOpen} onOpenChange={setIsNewCustomerOpen} />

        <RateconPreviewDialog
          open={isPreviewOpen}
          onOpenChange={setIsPreviewOpen}
          onExtracted={(jobs) => {
            setGhostImports((prev) => [
              ...jobs.map((j) => ({
                jobId: j.jobId,
                fileName: j.fileName,
                startedAt: new Date(),
                status: GHOST_IMPORT_STATUS.PROCESSING,
                retryCount: 0,
              })),
              ...prev,
            ]);
          }}
          completedJobIds={completedJobIds}
          failedJobs={failedJobs}
        />

        {/* Smart Assign Sheet */}
        <SmartAssignSheet
          open={!!assignSheetLoadId}
          onOpenChange={(open) => {
            if (!open) {
              setAssignSheetLoadId(null);
              setAssignSheetLoadData(null);
            }
          }}
          loadId={assignSheetLoadId || ''}
          loadNumber={assignSheetLoadData?.loadNumber || ''}
          referenceNumber={assignSheetLoadData?.referenceNumber}
          loadRoute={assignSheetLoadData?.loadRoute || ''}
          loadMiles={assignSheetLoadData?.loadMiles || 0}
          loadEquipmentType={assignSheetLoadData?.loadEquipmentType || ''}
          pickupDate={assignSheetLoadData?.pickupDate}
          rate={assignSheetLoadData?.rate}
          weight={assignSheetLoadData?.weight}
          onAssigned={() => {
            setAssignSheetLoadId(null);
            setAssignSheetLoadData(null);
            refetchLoads();
          }}
          onNextLoad={() => {
            const nextPending = pending.find((l) => l.loadNumber !== assignSheetLoadId);
            if (nextPending) {
              openAssignSheet(nextPending);
            } else {
              setAssignSheetLoadId(null);
              setAssignSheetLoadData(null);
              showSuccess('All pending loads assigned');
            }
          }}
        />

        {/* View Smart Route Sheet */}
        <Sheet
          open={!!viewPlanId}
          onOpenChange={(open) => {
            if (!open) setViewPlanId(null);
          }}
        >
          <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col overflow-y-auto" pinnable resizable>
            <SheetHeader className="px-4 pt-4 pb-2">
              <SheetTitle className="flex items-center justify-between">
                <span>Smart Route</span>
                {viewPlanId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground underline"
                    onClick={() => window.open(`/dispatcher/smart-routes/${viewPlanId}`, '_blank')}
                  >
                    View Full Details →
                  </Button>
                )}
              </SheetTitle>
            </SheetHeader>
            {viewPlanData ? (
              <PlanDetailPanel plan={viewPlanData} variant="inline" />
            ) : viewPlanId ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : null}
          </SheetContent>
        </Sheet>

        {/* Revert Status Dialog (triggered by drag) */}
        {revertDialogLoad && (
          <RevertLoadDialog
            open={!!revertDialogLoad}
            onOpenChange={(open) => {
              if (!open) {
                setRevertDialogLoad(null);
                refetchLoads();
              }
            }}
            loadId={revertDialogLoad.loadNumber}
            loadNumber={revertDialogLoad.loadNumber}
            currentStatus={revertDialogLoad.status}
          />
        )}

        {/* Delete Draft Confirmation */}
        <AlertDialog open={!!deleteConfirmLoad} onOpenChange={(open) => !open && setDeleteConfirmLoad(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Draft</AlertDialogTitle>
              <AlertDialogDescription>
                Permanently delete load {deleteConfirmLoad?.loadNumber}? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-critical hover:bg-critical/90 text-white"
                onClick={async () => {
                  if (deleteConfirmLoad) {
                    try {
                      await deleteLoadMutation.mutateAsync(deleteConfirmLoad.loadNumber);
                      showSuccess(`Draft ${deleteConfirmLoad.loadNumber} deleted`);
                      if (selectedLoad?.loadNumber === deleteConfirmLoad.loadNumber) {
                        setSelectedLoad(null);
                        setIsDetailOpen(false);
                      }
                      await refetchLoads();
                    } catch {
                      showError('Delete failed', 'Could not delete draft');
                    }
                    setDeleteConfirmLoad(null);
                  }
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reason Dialog for On Hold / TONU / Cancel */}
        <AlertDialog
          open={!!reasonDialog}
          onOpenChange={(open) => {
            if (!open) {
              setReasonDialog(null);
              setReasonText('');
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{reasonDialog?.title}</AlertDialogTitle>
              <AlertDialogDescription>{reasonDialog?.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
              <Textarea
                placeholder={reasonDialog?.reasonRequired === false ? 'Reason (optional)...' : 'Enter reason...'}
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                rows={3}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setReasonDialog(null);
                  setReasonText('');
                }}
              >
                Go Back
              </AlertDialogCancel>
              <AlertDialogAction
                className={
                  reasonDialog?.status === 'TONU' || reasonDialog?.status === 'CANCELLED'
                    ? 'bg-critical hover:bg-critical/90 text-white'
                    : ''
                }
                disabled={reasonDialog?.reasonRequired !== false && !reasonText.trim()}
                onClick={async () => {
                  if (reasonDialog) {
                    await handleStatusChange(reasonDialog.loadId, reasonDialog.status, reasonText.trim() || undefined);
                    setReasonDialog(null);
                    setReasonText('');
                  }
                }}
              >
                {reasonDialog?.actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Toolbar overflow tools (opened from ⋯ More) ── */}
        <RateLookupDialog open={rateLookupOpen} onOpenChange={setRateLookupOpen} />
        <JobsActivityPanel
          asDialog
          open={activityOpen}
          onOpenChange={setActivityOpen}
          pendingJobIds={pendingJobIds}
          onActiveCountChange={setActiveJobCount}
          onLoadClick={(loadId) => {
            loadsApi
              .getById(loadId)
              .then((fullLoad) => {
                setSelectedLoad(fullLoad);
                setIsDetailOpen(true);
              })
              .catch(() => {});
          }}
        />

        {/* ── Trip: Floating Action Bar ── */}
        {selectedLoadIds.size >= 2 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg dark:bg-gray-900">
            <span className="text-sm font-medium text-foreground">{selectedLoadIds.size} loads selected</span>
            <Button size="sm" onClick={() => setIsCreateTripOpen(true)}>
              <Layers className="h-3.5 w-3.5 mr-1.5" />
              Group into Trip
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        )}

        {/* ── Trip: Create Sheet ── */}
        <CreateTripSheet
          open={isCreateTripOpen}
          onOpenChange={(open) => {
            setIsCreateTripOpen(open);
            if (!open) clearSelection();
          }}
          selectedLoads={selectedLoadsForTrip}
          onSuccess={() => {
            clearSelection();
            refetchLoads();
          }}
        />

        {/* ── Trip: Summary Sheet ── */}
        <TripSummarySheet
          tripId={selectedTripId}
          open={!!selectedTripId}
          onOpenChange={(open) => {
            if (!open) setSelectedTripId(null);
          }}
          onLoadClick={(loadId) => {
            // Open by load number directly — a trip's load may not be in the
            // board's capped set, so don't rely on loads.find().
            setSelectedTripId(null);
            handleLoadClickByNumber(loadId);
          }}
        />
      </div>
    </TooltipProvider>
  );
}

// ============================================================================
// Kanban Column
// ============================================================================

function KanbanColumn({
  title,
  status,
  count,
  loads,
  onCardClick,
  onAssign,
  onStatusChange,
  onDuplicate,
  onCopyTrackingLink,
  onDelete,
  onRevertStatus,
  onViewPlan,
  dragState: columnDragState,
  pendingMutation: columnPendingMutation,
  shouldSuppressClick: columnSuppressClick,
  ghostImports,
  onGhostDismiss,
  onGhostCancel,
  onGhostRetry,
  onGhostCheckStatus,
  onGhostClick,
  selectedLoadIds,
  inSelectionMode,
  onToggleSelect,
  onTripClick,
}: {
  title: string;
  status: LoadStatus;
  count: number;
  loads: LoadListItem[];
  onCardClick: (load: LoadListItem) => void;
  onAssign?: (load: LoadListItem) => void;
  onStatusChange?: (load: LoadListItem, status: string) => void;
  onDuplicate?: (load: LoadListItem) => void;
  onCopyTrackingLink?: (load: LoadListItem) => void;
  onDelete?: (load: LoadListItem) => void;
  onRevertStatus?: (load: LoadListItem) => void;
  onViewPlan?: (planId: string) => void;
  dragState?: { activeSourceStatus: string | null; validTargets: string[]; activeLoad?: LoadListItem | null };
  pendingMutation?: string | null;
  shouldSuppressClick?: () => boolean;
  ghostImports?: GhostImport[];
  onGhostDismiss?: (jobId: number) => void;
  onGhostCancel?: (jobId: number) => void;
  onGhostRetry?: (jobId: number) => void;
  onGhostCheckStatus?: (jobId: number) => void;
  onGhostClick?: (ghost: GhostImport) => void;
  selectedLoadIds?: Set<string>;
  inSelectionMode?: boolean;
  onToggleSelect?: (loadId: string, loadData?: LoadListItem) => void;
  onTripClick?: (tripId: string) => void;
}) {
  const isActive = !!columnDragState?.activeSourceStatus;
  const transition = columnDragState?.activeSourceStatus
    ? getTransition(columnDragState.activeSourceStatus, status)
    : null;
  const isValidTarget = columnDragState?.validTargets.includes(status) ?? false;

  const relayLegSeq = columnDragState?.activeLoad?.isRelay
    ? (columnDragState.activeLoad.activeLeg?.sequence ?? null)
    : null;

  return (
    <KanbanDropZone
      id={status}
      transition={isValidTarget ? transition : null}
      isActive={isActive}
      relayLegSequence={relayLegSeq}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <Badge variant="muted" className="text-xs">
          {count}
        </Badge>
      </div>
      <div className="p-2 space-y-2">
        {ghostImports &&
          onGhostDismiss &&
          onGhostCancel &&
          onGhostRetry &&
          onGhostCheckStatus &&
          ghostImports.map((ghost) => (
            <GhostImportCard
              key={ghost.jobId}
              ghost={ghost}
              onDismiss={onGhostDismiss}
              onCancel={onGhostCancel}
              onRetry={onGhostRetry}
              onCheckStatus={onGhostCheckStatus}
              onClick={onGhostClick}
            />
          ))}
        {loads.map((load) => (
          <LoadCard
            key={load.loadNumber}
            load={load}
            isDragDisabled={status === 'ON_HOLD' || columnPendingMutation === load.loadNumber}
            shouldSuppressClick={columnSuppressClick}
            onClick={() => onCardClick(load)}
            onAssign={onAssign ? () => onAssign(load) : undefined}
            onStatusChange={onStatusChange ? (s: string) => onStatusChange(load, s) : undefined}
            onDuplicate={onDuplicate ? () => onDuplicate(load) : undefined}
            onCopyTrackingLink={onCopyTrackingLink ? () => onCopyTrackingLink(load) : undefined}
            onDelete={onDelete ? () => onDelete(load) : undefined}
            onRevertStatus={onRevertStatus ? () => onRevertStatus(load) : undefined}
            onViewPlan={onViewPlan}
            isSelected={selectedLoadIds?.has(load.loadNumber)}
            inSelectionMode={inSelectionMode}
            onToggleSelect={onToggleSelect ? () => onToggleSelect(load.loadNumber, load) : undefined}
            onTripClick={onTripClick}
          />
        ))}
        {loads.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No loads</p>}
      </div>
    </KanbanDropZone>
  );
}

// ============================================================================
// Load Card
// ============================================================================

function LoadCard({
  load,
  onClick,
  onAssign,
  onStatusChange,
  onDuplicate,
  onCopyTrackingLink,
  onDelete,
  onRevertStatus,
  onViewPlan,
  isDragDisabled,
  shouldSuppressClick,
  isSelected,
  inSelectionMode,
  onToggleSelect,
  onTripClick,
}: {
  load: LoadListItem;
  onClick: () => void;
  onAssign?: () => void;
  onStatusChange?: (status: string) => void;
  onDuplicate?: () => void;
  onCopyTrackingLink?: () => void;
  onDelete?: () => void;
  onRevertStatus?: () => void;
  onViewPlan?: (planId: string) => void;
  isDragDisabled?: boolean;
  shouldSuppressClick?: () => boolean;
  isSelected?: boolean;
  inSelectionMode?: boolean;
  onToggleSelect?: () => void;
  onTripClick?: (tripId: string) => void;
}) {
  const { formatCalendarDate } = useFormatters();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: load.loadNumber,
    data: { load },
    disabled: isDragDisabled,
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;
  const formatShortDate = (dateStr?: string) => {
    if (!dateStr) return null;
    return formatCalendarDate(dateStr, DISPLAY_FORMATS.COMPACT);
  };

  const pickupStr = formatShortDate(load.pickupDate ?? undefined);
  const deliveryStr = formatShortDate(load.deliveryDate ?? undefined);
  const pickupDisplay = pickupStr && load.pickupTime ? `${pickupStr}, ${load.pickupTime}` : (pickupStr ?? null);
  const deliveryDisplay =
    deliveryStr && load.deliveryTime ? `${deliveryStr}, ${load.deliveryTime}` : (deliveryStr ?? null);
  const routeLabel =
    load.originCity && load.destinationCity
      ? `${load.originCity}, ${load.originState || ''} → ${load.destinationCity}, ${load.destinationState || ''}`
      : null;

  // Relay: derive active leg info for display (only if feature enabled)
  const relayEnabled = useRelayEnabled();
  const isRelay = relayEnabled && load.isRelay;
  const activeLeg = isRelay ? load.activeLeg : null;
  const displayDriver = isRelay && activeLeg ? activeLeg.driverName : load.driverName;
  const displayVehicle = isRelay && activeLeg ? activeLeg.vehicleUnitNumber : load.vehicleUnitNumber;

  return (
    <Card
      ref={setNodeRef}
      style={{
        ...style,
        ...(!isRelay && load.tripId ? { borderLeftColor: getTripColor(load.tripId) } : {}),
      }}
      className={cn(
        'group relative cursor-pointer hover:bg-accent/50 transition-all duration-300',
        isDragging && 'opacity-50 scale-[1.02] shadow-lg',
        load.status === 'DELIVERED' && 'opacity-0 scale-95',
        isRelay && 'border-l-[3px] border-l-purple-500',
        !isRelay && load.tripId && 'border-l-[3px]',
        isSelected && 'ring-2 ring-primary/50 bg-primary/5 dark:bg-primary/10',
      )}
      onClick={(e) => {
        if (shouldSuppressClick?.()) {
          e.preventDefault();
          return;
        }
        onClick();
      }}
      {...listeners}
      {...attributes}
    >
      <CardContent className="p-3 pr-8 space-y-1">
        {/* Row 1: Load ID · Ref + inline checkbox */}
        <div className="flex items-center gap-1.5">
          {onToggleSelect && !load.tripId && !load.isRelay && ['DRAFT', 'PENDING'].includes(load.status) && (
            <div
              className={cn(
                'shrink-0 transition-opacity duration-150',
                isSelected || inSelectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect()} className="h-3.5 w-3.5" />
            </div>
          )}
          <span className="text-xs font-mono font-medium text-foreground truncate">
            {load.loadNumber}
            {load.referenceNumber && (
              <span className="text-muted-foreground font-normal ml-1">· Ref: {load.referenceNumber}</span>
            )}
          </span>
        </div>

        {/* Row 2: Compact tag row — only rendered when there are tags */}
        {(isRelay ||
          (load.routePlan && (load.status === 'ASSIGNED' || load.status === 'IN_TRANSIT')) ||
          load.intakeSource) && (
          <div className="flex items-center gap-1 flex-wrap">
            {isRelay && (
              <Badge variant="outline" className={cn(RELAY_BADGE_CLASS, 'text-2xs px-1.5 py-0')}>
                &#x27D0; RELAY
              </Badge>
            )}
            {load.isRelay && activeLeg && (
              <LegStatusPill key={activeLeg.legId} sequence={activeLeg.sequence} status={activeLeg.status} compact />
            )}
            {load.tripId && (
              <TripBadge
                tripId={load.tripId}
                tripOrder={load.tripOrder}
                tripLoadCount={load.tripLoadCount}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onTripClick?.(load.tripId!);
                }}
              />
            )}
            {load.routePlan && (load.status === 'ASSIGNED' || load.status === 'IN_TRANSIT') && (
              <Badge
                variant="outline"
                className={`text-2xs px-1.5 py-0 ${
                  load.routePlan.status === 'active' ? 'text-info border-info/20' : 'text-muted-foreground'
                }`}
              >
                {load.routePlan.status === 'active' ? 'Smart Route' : 'Draft Route'}
              </Badge>
            )}
            <IntakeSourceBadge source={load.intakeSource} status={load.status} />
          </div>
        )}

        {/* Row 3: Customer name */}
        <p className="text-sm font-medium text-foreground truncate">{load.customerName}</p>

        {/* Row 4: Route */}
        {routeLabel && <p className="text-xs text-muted-foreground truncate">{routeLabel}</p>}

        {/* Row 5: Dates */}
        {(pickupDisplay || deliveryDisplay) && (
          <p className="text-xs text-muted-foreground">
            {pickupDisplay}
            {pickupDisplay && deliveryDisplay ? ' → ' : ''}
            {deliveryDisplay}
          </p>
        )}

        {/* Row 6: Stops · Weight · Rate */}
        <p className="text-xs text-muted-foreground">
          {load.stopCount} {load.stopCount === 1 ? 'stop' : 'stops'} &middot; {load.weightLbs?.toLocaleString()} lbs
          {load.rateCents ? ` · $${(load.rateCents / 100).toLocaleString()}` : ''}
        </p>

        {/* Row 7: Driver · Vehicle */}
        {displayDriver && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full shrink-0',
                load.status === 'IN_TRANSIT' ? 'bg-green-500 animate-pulse' : 'bg-blue-500',
              )}
            />
            {displayDriver}
            {isRelay && activeLeg ? ` (Leg ${activeLeg.sequence})` : ''}
            {displayVehicle ? ` · ${displayVehicle}` : ''}
          </div>
        )}
      </CardContent>
      {/* Three-dot menu */}
      <div className="absolute top-2 right-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {load.routePlan && (load.status === 'ASSIGNED' || load.status === 'IN_TRANSIT') && (
              <>
                <DropdownMenuItem onClick={() => onViewPlan?.(load.routePlan!.planId)}>
                  <Route className="h-4 w-4 mr-2" />
                  View Smart Route
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {load.status === 'DRAFT' && (
              <>
                <DropdownMenuItem onClick={() => onClick()}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onStatusChange?.('PENDING')}>Confirm Load</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-critical" onClick={() => onDelete?.()}>
                  Delete
                </DropdownMenuItem>
              </>
            )}
            {load.status === 'PENDING' && (
              <>
                <DropdownMenuItem onClick={() => onAssign?.()}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign Driver
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onStatusChange?.('DRAFT')}>Move to Draft</DropdownMenuItem>
                <DropdownMenuItem className="text-critical" onClick={() => onStatusChange?.('CANCELLED')}>
                  Cancel
                </DropdownMenuItem>
              </>
            )}
            {load.status === 'ASSIGNED' && (
              <>
                <DropdownMenuItem onClick={() => onStatusChange?.('IN_TRANSIT')}>
                  <Truck className="h-4 w-4 mr-2" />
                  Mark Picked Up
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onCopyTrackingLink?.()}>Copy Tracking Link</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onStatusChange?.('PENDING')}>Unassign</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate?.()}>Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-critical" onClick={() => onStatusChange?.('CANCELLED')}>
                  Cancel
                </DropdownMenuItem>
                <DropdownMenuItem className="text-critical" onClick={() => onStatusChange?.('TONU')}>
                  TONU
                </DropdownMenuItem>
              </>
            )}
            {load.status === 'IN_TRANSIT' && (
              <>
                <DropdownMenuItem onClick={() => onStatusChange?.('DELIVERED')}>
                  <Package className="h-4 w-4 mr-2" />
                  Mark Delivered
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onCopyTrackingLink?.()}>Copy Tracking Link</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onRevertStatus?.()}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Revert to Assigned
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate?.()}>Duplicate</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onStatusChange?.('ON_HOLD')}>On Hold</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-critical" onClick={() => onStatusChange?.('CANCELLED')}>
                  Cancel
                </DropdownMenuItem>
                <DropdownMenuItem className="text-critical" onClick={() => onStatusChange?.('TONU')}>
                  TONU
                </DropdownMenuItem>
              </>
            )}
            {load.status === 'ON_HOLD' && (
              <>
                <DropdownMenuItem onClick={() => onStatusChange?.('PENDING')}>Resume to Pending</DropdownMenuItem>
                {load.driverName && (
                  <DropdownMenuItem onClick={() => onStatusChange?.('ASSIGNED')}>Resume to Assigned</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onStatusChange?.('DRAFT')}>Move to Draft</DropdownMenuItem>
                <DropdownMenuItem className="text-critical" onClick={() => onStatusChange?.('CANCELLED')}>
                  Cancel
                </DropdownMenuItem>
              </>
            )}
            {(load.status === 'DELIVERED' || load.status === 'CANCELLED' || load.status === 'TONU') && (
              <DropdownMenuItem onClick={() => onDuplicate?.()}>Duplicate</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}

// ============================================================================
// Intake Source Badge
// ============================================================================

function IntakeSourceBadge({ source, status }: { source?: string; status?: string }) {
  if (source === 'import' && status === 'DRAFT') {
    return (
      <Badge variant="outline" className="text-2xs gap-0.5 px-1.5 py-0">
        <Sparkles className="h-2.5 w-2.5" />
        Import
      </Badge>
    );
  }
  if (source === 'edi') {
    return (
      <Badge variant="outline" className="text-violet-400 border-violet-500/30 text-2xs px-1.5 py-0">
        EDI
      </Badge>
    );
  }
  const labels: Record<string, string> = {
    manual: 'Manual',
    template: 'Template',
    import: 'Import',
    email: 'Email',
    dat: 'DAT',
    tms_sync: 'TMS',
  };
  return <span className="text-2xs text-muted-foreground">{labels[source || 'manual'] || source || 'Manual'}</span>;
}

// ============================================================================
// Loads Table (Completed / Cancelled)
// ============================================================================

function LoadsTable({
  loads,
  onRowClick,
  emptyMessage,
  refData,
  showBillingStatus,
  showStatus,
}: {
  loads: LoadListItem[];
  onRowClick: (load: LoadListItem) => void;
  emptyMessage: string;
  refData?: ReferenceDataMap;
  showBillingStatus?: boolean;
  showStatus?: boolean;
}) {
  const { formatCalendarDate } = useFormatters();
  if (loads.length === 0) {
    return <p className="text-center py-16 text-muted-foreground">{emptyMessage}</p>;
  }

  const formatDate = (dateStr?: string) => {
    return formatCalendarDate(dateStr ?? null, DISPLAY_FORMATS.FRIENDLY);
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Load #</TableHead>
          {showStatus && <TableHead>Status</TableHead>}
          <TableHead className="hidden sm:table-cell">Customer</TableHead>
          <TableHead className="hidden md:table-cell">Route</TableHead>
          <TableHead className="hidden lg:table-cell">Pickup</TableHead>
          <TableHead className="hidden lg:table-cell">Delivery</TableHead>
          <TableHead className="hidden sm:table-cell">Weight</TableHead>
          <TableHead className="hidden md:table-cell">Equipment</TableHead>
          <TableHead className="hidden md:table-cell">Source</TableHead>
          {showBillingStatus && <TableHead className="hidden lg:table-cell">Billing</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {loads.map((load) => (
          <TableRow key={load.loadNumber} className="cursor-pointer" onClick={() => onRowClick(load)}>
            <TableCell className="font-medium font-mono text-foreground">
              {formatLoadLabel(load.loadNumber, load.referenceNumber)}
            </TableCell>
            {showStatus && (
              <TableCell>
                <Badge
                  variant={load.status === 'CANCELLED' ? 'destructive' : 'default'}
                  className="text-2xs capitalize"
                >
                  {load.status.replace(/_/g, ' ').toLowerCase()}
                </Badge>
              </TableCell>
            )}
            <TableCell className="text-foreground hidden sm:table-cell">{load.customerName}</TableCell>
            <TableCell className="text-foreground hidden md:table-cell text-xs">
              {load.originCity && load.destinationCity
                ? `${load.originCity}, ${load.originState || ''} → ${load.destinationCity}, ${load.destinationState || ''}`
                : `${load.stopCount} ${load.stopCount === 1 ? 'stop' : 'stops'}`}
            </TableCell>
            <TableCell className="text-foreground hidden lg:table-cell text-xs">
              {formatDate(load.pickupDate ?? undefined)}
            </TableCell>
            <TableCell className="text-foreground hidden lg:table-cell text-xs">
              {formatDate(load.deliveryDate ?? undefined)}
            </TableCell>
            <TableCell className="text-foreground hidden sm:table-cell">
              {load.weightLbs?.toLocaleString()} lbs
            </TableCell>
            <TableCell className="text-foreground capitalize hidden md:table-cell">
              {(() => {
                const displayEquipmentType = load.requiredEquipmentType;
                return (
                  refData?.equipmentType?.find(
                    (item) => item.code.toLowerCase() === displayEquipmentType?.toLowerCase(),
                  )?.label ??
                  displayEquipmentType?.replace(/_/g, ' ') ??
                  '—'
                );
              })()}
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <IntakeSourceBadge source={load.intakeSource} status={load.status} />
            </TableCell>
            {showBillingStatus && (
              <TableCell className="hidden lg:table-cell">
                {load.billingStatus && <BillingStatusBadge status={load.billingStatus} />}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ============================================================================
// New Load Form (Enhanced)
// ============================================================================

// ============================================================================
// New Load Form
// ============================================================================

function NewLoadForm({
  onSuccess,
  onCancel,
  refData,
}: {
  onSuccess: () => void;
  onCancel: () => void;
  refData?: ReferenceDataMap;
}) {
  const { formatCalendarDate } = useFormatters();
  const [formData, setFormData] = useState({
    customerName: '',
    weightLbs: 0,
    requiredEquipmentType: 'DRY_VAN',
    referenceNumber: '',
    commodityType: 'general',
    specialRequirements: '',
    rateCents: undefined as number | undefined,
    pieces: undefined as number | undefined,
  });

  const [stops, setStops] = useState<LoadStopCreate[]>([
    {
      stopId: `STOP-${Date.now().toString(36)}`,
      sequenceOrder: 1,
      actionType: 'pickup',
      estimatedDockHours: 2,
      earliestArrival: '',
      latestArrival: '',
      appointmentDate: '',
      name: '',
      city: '',
      state: '',
      zipCode: '',
    },
    {
      stopId: `STOP-${(Date.now() + 1).toString(36)}`,
      sequenceOrder: 2,
      actionType: 'delivery',
      estimatedDockHours: 2,
      earliestArrival: '',
      latestArrival: '',
      appointmentDate: '',
      name: '',
      city: '',
      state: '',
      zipCode: '',
    },
  ]);

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string | number | null>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const addStop = () => {
    setStops([
      ...stops,
      {
        stopId: `STOP-${Date.now().toString(36)}`,
        sequenceOrder: stops.length + 1,
        actionType: 'delivery',
        estimatedDockHours: 2,
        earliestArrival: '',
        latestArrival: '',
        appointmentDate: '',
        name: '',
        city: '',
        state: '',
        zipCode: '',
      },
    ]);
  };

  const removeStop = (index: number) => {
    if (stops.length <= 2) return;
    const newStops = stops.filter((_, i) => i !== index);
    setStops(newStops.map((s, i) => ({ ...s, sequenceOrder: i + 1 })));
  };

  const updateStop = (index: number, field: string, value: string | number) => {
    const newStops = [...stops];
    newStops[index] = { ...newStops[index], [field]: value };
    setStops(newStops);
  };

  const handleStopLocationChange = (
    index: number,
    selected: {
      id?: number;
      stopId: string;
      name: string;
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      lat?: number;
      lon?: number;
    } | null,
  ) => {
    const newStops = [...stops];
    if (selected) {
      newStops[index] = {
        ...newStops[index],
        stopId: selected.stopId,
        name: selected.name,
        address: selected.address || '',
        city: selected.city || '',
        state: selected.state || '',
        zipCode: selected.zipCode || '',
      };
    } else {
      newStops[index] = {
        ...newStops[index],
        stopId: `STOP-${Date.now().toString(36)}`,
        name: '',
        address: '',
        city: '',
        state: '',
        zipCode: '',
      };
    }
    setStops(newStops);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setFormError(null);

    try {
      // Resolve customer
      if (!selectedCustomerId) {
        setFormError('Please select a customer');
        submittingRef.current = false;
        setIsSubmitting(false);
        return;
      }
      const customerId = selectedCustomerId;
      const customerName = formData.customerName;

      // Filter out null/empty custom field values
      const filteredCustomFields = Object.fromEntries(
        Object.entries(customFieldValues).filter(([, v]) => v != null && v !== ''),
      );

      const loadData: LoadCreate = {
        customerName: customerName,
        weightLbs: formData.weightLbs,
        commodityType: formData.commodityType,
        requiredEquipmentType: formData.requiredEquipmentType || undefined,
        specialRequirements: formData.specialRequirements || undefined,
        referenceNumber: formData.referenceNumber || undefined,
        rateCents: formData.rateCents || undefined,
        pieces: formData.pieces || undefined,
        customerId: customerId,
        ...(Object.keys(filteredCustomFields).length > 0 ? { customFieldValues: filteredCustomFields } : {}),
        stops: stops.map((s) => ({
          ...s,
          earliestArrival: s.earliestArrival || undefined,
          latestArrival: s.latestArrival || undefined,
          appointmentDate: s.appointmentDate || undefined,
          zipCode: s.zipCode || undefined,
        })),
      };
      await loadsApi.create(loadData);
      onSuccess();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create load');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const [expandedStop, setExpandedStop] = useState<number | null>(null);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Core Details */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Customer *</Label>
            <CustomerPicker
              value={selectedCustomerId}
              onChange={(id, name) => {
                setSelectedCustomerId(id);
                setFormData((prev) => ({ ...prev, customerName: name }));
              }}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Reference / PO #</Label>
            <Input
              className="h-9"
              value={formData.referenceNumber}
              onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
              placeholder="PO-12345"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Equipment *</Label>
            <Select
              value={formData.requiredEquipmentType}
              onValueChange={(v) => setFormData({ ...formData, requiredEquipmentType: v })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  refData?.equipmentType?.map((item) => ({ code: item.code.toLowerCase(), label: item.label })) ??
                  EQUIPMENT_TYPES_FALLBACK
                ).map((et) => (
                  <SelectItem key={et.code} value={et.code}>
                    {et.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Commodity</Label>
            <Select
              value={formData.commodityType}
              onValueChange={(v) => setFormData({ ...formData, commodityType: v })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="dry_goods">Dry Goods</SelectItem>
                <SelectItem value="refrigerated">Refrigerated</SelectItem>
                <SelectItem value="frozen">Frozen</SelectItem>
                <SelectItem value="hazmat">Hazmat</SelectItem>
                <SelectItem value="fragile">Fragile</SelectItem>
                <SelectItem value="oversized">Oversized</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Weight (lbs) *</Label>
            <Input
              className="h-9"
              type="number"
              value={formData.weightLbs || ''}
              onChange={(e) => setFormData({ ...formData, weightLbs: parseInt(e.target.value) || 0 })}
              placeholder="40,000"
              required
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Rate ($)</Label>
            <Input
              className="h-9"
              type="number"
              step="0.01"
              min="0"
              placeholder="2,450.00"
              value={formData.rateCents !== undefined ? (formData.rateCents / 100).toFixed(2) : ''}
              onChange={(e) => {
                const dollars = parseFloat(e.target.value);
                setFormData({
                  ...formData,
                  rateCents: isNaN(dollars) ? undefined : Math.round(dollars * 100),
                });
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Pieces / Pallets</Label>
            <Input
              className="h-9"
              type="number"
              min="0"
              placeholder="26"
              value={formData.pieces ?? ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  pieces: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
            />
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Special Requirements</Label>
          <Textarea
            className="min-h-[60px] resize-y"
            value={formData.specialRequirements}
            onChange={(e) => setFormData({ ...formData, specialRequirements: e.target.value })}
            placeholder="Temp controlled 34-38F, no double stack, tail-gate delivery, etc."
            rows={2}
          />
        </div>
      </div>

      {/* Separator */}
      <div className="border-t border-border" />

      {/* Route — Compact Stops */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Route</h4>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={addStop}>
            <Plus className="h-3 w-3 mr-1" />
            Add Stop
          </Button>
        </div>

        <div className="relative">
          {/* Vertical connector line */}
          {stops.length > 1 && (
            <div className="absolute left-[1.2rem] top-[1.5rem] bottom-[1.5rem] w-px bg-border z-0" />
          )}

          <div className="space-y-1.5 relative z-10">
            {stops.map((stop, index) => (
              <div key={index}>
                {/* Compact stop row */}
                <div
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors cursor-pointer group ${
                    expandedStop === index ? 'bg-accent/70' : 'hover:bg-accent/40'
                  }`}
                  onClick={() => setExpandedStop(expandedStop === index ? null : index)}
                >
                  {/* Stop number dot */}
                  <div
                    className={`flex-shrink-0 flex items-center justify-center w-[30px] h-[30px] rounded-full text-xs font-bold ${
                      stop.actionType === 'pickup'
                        ? 'bg-info/10 text-info'
                        : stop.actionType === 'both'
                          ? 'bg-muted text-foreground'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {index + 1}
                  </div>

                  {/* Stop summary — inline */}
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-2xs px-1.5 py-0 h-5 flex-shrink-0 ${
                        stop.actionType === 'pickup'
                          ? 'border-info/20 text-info'
                          : stop.actionType === 'both'
                            ? 'border-border text-foreground'
                            : 'border-border text-muted-foreground'
                      }`}
                    >
                      {stop.actionType === 'pickup' ? 'P' : stop.actionType === 'both' ? 'P/D' : 'D'}
                    </Badge>
                    <span className="text-sm text-foreground truncate">
                      {stop.name || <span className="text-muted-foreground italic">No location</span>}
                    </span>
                    {(stop.city || stop.state) && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {[stop.city, stop.state].filter(Boolean).join(', ')}
                      </span>
                    )}
                    {(stop.earliestArrival || stop.latestArrival) && (
                      <span className="text-2xs text-muted-foreground flex-shrink-0 font-mono">
                        {stop.earliestArrival || '?'}–{stop.latestArrival || '?'}
                      </span>
                    )}
                  </div>

                  {/* Expand indicator + delete */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {stops.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeStop(index);
                        }}
                        className="h-6 w-6 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-critical transition-opacity"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                    <ChevronRight
                      className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                        expandedStop === index ? 'rotate-90' : ''
                      }`}
                    />
                  </div>
                </div>

                {/* Expanded stop details */}
                {expandedStop === index && (
                  <div className="ml-[42px] mt-1 mb-2 p-3 rounded-md border border-border bg-card space-y-3">
                    {/* Location picker — replaces name, address, city, state, zip inputs */}
                    <StopLocationPicker
                      value={
                        stop.name
                          ? {
                              stopId: stop.stopId,
                              name: stop.name,
                              address: stop.address,
                              city: stop.city,
                              state: stop.state,
                              zipCode: stop.zipCode,
                            }
                          : null
                      }
                      onChange={(selected) => handleStopLocationChange(index, selected)}
                      refData={
                        refData
                          ? { us_state: refData.us_state?.map((item) => ({ code: item.code, label: item.label })) }
                          : undefined
                      }
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Type</Label>
                        <Select value={stop.actionType} onValueChange={(v) => updateStop(index, 'actionType', v)}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pickup">Pickup</SelectItem>
                            <SelectItem value="delivery">Delivery</SelectItem>
                            <SelectItem value="both">Both</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label className="text-[11px] text-muted-foreground">Appointment date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full h-8 text-sm justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-3 w-3" />
                            {stop.appointmentDate
                              ? formatCalendarDate(stop.appointmentDate, DISPLAY_FORMATS.FRIENDLY)
                              : 'Select date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={stop.appointmentDate ? calendarDateToDate(stop.appointmentDate) : undefined}
                            onSelect={(date) =>
                              updateStop(index, 'appointmentDate', date ? dateToCalendarDate(date) : '')
                            }
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Dock hours</Label>
                        <Input
                          className="h-8 text-sm"
                          type="number"
                          step="0.5"
                          value={stop.estimatedDockHours}
                          onChange={(e) => updateStop(index, 'estimatedDockHours', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Appointment window</Label>
                        <div className="flex items-center gap-1.5">
                          <Input
                            className="h-8 text-sm font-mono"
                            value={stop.earliestArrival || ''}
                            onChange={(e) => updateStop(index, 'earliestArrival', e.target.value)}
                            placeholder="06:00"
                            maxLength={5}
                          />
                          <span className="text-muted-foreground text-xs">–</span>
                          <Input
                            className="h-8 text-sm font-mono"
                            value={stop.latestArrival || ''}
                            onChange={(e) => updateStop(index, 'latestArrival', e.target.value)}
                            placeholder="14:00"
                            maxLength={5}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Custom Fields */}
      <CustomFieldsSection entityType="LOAD" values={customFieldValues} onChange={setCustomFieldValues} mode="edit" />

      {formError && <div className="text-sm text-critical">{formError}</div>}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Load'}
        </Button>
      </div>
    </form>
  );
}

// ============================================================================
// Helpers
// ============================================================================

// ============================================================================
// Pagination Controls
// ============================================================================

function PaginationControls({
  offset,
  limit,
  count,
  onChange,
}: {
  offset: number;
  limit: number;
  count: number;
  onChange: (offset: number) => void;
}) {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(count / limit));
  const hasNext = offset + limit < count;

  return (
    // Extra right padding so the Next button clears the floating Ask-Sally orb.
    <div className="flex items-center justify-between pt-2 pr-16 sm:pr-20">
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages} ({count} total)
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          <ChevronLeft className="h-3 w-3 mr-1" />
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => onChange(offset + limit)}>
          Next
          <ChevronRight className="h-3 w-3 ml-1" />
        </Button>
      </div>
    </div>
  );
}
