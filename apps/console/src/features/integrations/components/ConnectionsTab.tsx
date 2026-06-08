'use client';

import { useState, useEffect } from 'react';
import { Button } from '@app/ui/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@app/ui/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@app/ui/components/ui/sheet';
import { SheetKeyboardHint } from '@app/ui/components/ui/form-sheet';
import { Badge } from '@app/ui/components/ui/badge';
import { Card, CardContent } from '@app/ui/components/ui/card';
import { Separator } from '@app/ui/components/ui/separator';
import {
  type IntegrationConfig,
  type IntegrationType,
  type IntegrationVendor,
  listIntegrations,
  deleteIntegration,
  updateIntegration,
  getVendorRegistry,
  type VendorMetadata,
  testConnection,
  triggerSync,
  getSyncHistory,
  type UnifiedSyncLog,
} from '../';
import { Switch } from '@app/ui/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@app/ui/components/ui/tooltip';
import {
  Loader2,
  Plus,
  Gauge,
  Package,
  Calculator,
  Search,
  Trash2,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Settings2,
  ChevronDown,
  ChevronUp,
  Clock,
  XCircle,
  UploadCloud,
} from 'lucide-react';
import { showSuccess, showError, showSuccessWithLink } from '@app/ui';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@app/ui/components/ui/alert-dialog';
import { ConfigureIntegrationForm } from './ConfigureIntegrationForm';
import { JobDetailSheet, systemActivityApi, type Job } from '../../system-activity';

// Categories are now built dynamically from the vendor registry (see dynamicCategories below)

export function ConnectionsTab() {
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [vendors, setVendors] = useState<VendorMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<IntegrationType | null>(null);
  const [configureDialog, setConfigureDialog] = useState<{
    open: boolean;
    integration: IntegrationConfig | null;
    integrationType?: IntegrationType;
    vendor?: IntegrationVendor;
  }>({ open: false, integration: null });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    integration: IntegrationConfig | null;
  }>({ open: false, integration: null });
  const [isDeleting, setIsDeleting] = useState(false);
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [syncResults, setSyncResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [syncHistoryData, setSyncHistoryData] = useState<Record<string, UnifiedSyncLog[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<Set<string>>(new Set());
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobSheetOpen, setJobSheetOpen] = useState(false);
  const [loadingJobId, setLoadingJobId] = useState<number | null>(null);

  useEffect(() => {
    loadIntegrations();
    loadVendors();
  }, []);

  // Handle generic OAuth callback: ?oauth=connected&vendor=VENDOR_ID in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get('oauth');
    const oauthVendor = params.get('vendor');

    if (oauthStatus && oauthVendor) {
      if (oauthStatus === 'connected') {
        const vendorMeta = vendors.find((v) => v.id === oauthVendor);
        const vendorName = vendorMeta?.displayName ?? oauthVendor;
        showSuccess(`${vendorName} connected successfully!`);
        if (vendorMeta) {
          setSelectedCategory(vendorMeta.integrationType as IntegrationType);
        }
      } else if (oauthStatus === 'error') {
        showError(`Failed to connect ${oauthVendor}. Please try again.`);
      }
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
  }, [vendors]);

  const loadVendors = async () => {
    try {
      setIsLoadingVendors(true);
      const vendorList = await getVendorRegistry();
      setVendors(vendorList);
    } catch (err) {
      console.error('Failed to fetch vendor registry:', err);
    } finally {
      setIsLoadingVendors(false);
    }
  };

  const loadIntegrations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listIntegrations();
      setIntegrations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoryClick = (type: IntegrationType) => {
    setSelectedCategory(type);
  };

  const handleAddIntegration = (vendor: IntegrationVendor, type: IntegrationType) => {
    setSelectedCategory(null);
    setTimeout(() => {
      setConfigureDialog({
        open: true,
        integration: null,
        integrationType: type,
        vendor,
      });
    }, 100);
  };

  const handleConfigure = (integration: IntegrationConfig) => {
    setConfigureDialog({
      open: true,
      integration,
      integrationType: integration.integrationType,
      vendor: integration.vendor,
    });
  };

  const handleDelete = (integration: IntegrationConfig) => {
    setDeleteDialog({ open: true, integration });
  };

  const handleConfirmDelete = async () => {
    if (!deleteDialog.integration) return;

    setIsDeleting(true);
    try {
      await deleteIntegration(deleteDialog.integration.id);
      setDeleteDialog({ open: false, integration: null });
      showSuccess('Integration deleted');
      loadIntegrations();
    } catch (err) {
      showError('Error', err instanceof Error ? err.message : 'Failed to delete integration');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCloseDialog = () => {
    setConfigureDialog({ open: false, integration: null });
    setSelectedCategory(null);
  };

  const handleRefresh = () => {
    loadIntegrations();
  };

  const handleTestConnection = async (integration: IntegrationConfig) => {
    setTestingIds((prev) => new Set(prev).add(integration.id));
    // Clear previous test result for this integration
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[integration.id];
      return next;
    });

    try {
      const result = await testConnection(integration.id);
      // Store test result to display inline
      setTestResults((prev) => ({
        ...prev,
        [integration.id]: result as { success: boolean; message: string },
      }));

      // Update integration status in state without full refresh
      if (result.success) {
        setIntegrations((prev) =>
          prev.map((int) =>
            int.id === integration.id
              ? { ...int, status: 'ACTIVE' as const, lastSuccessAt: new Date().toISOString() }
              : int,
          ),
        );
      }
    } catch (err) {
      // Store error result
      setTestResults((prev) => ({
        ...prev,
        [integration.id]: {
          success: false,
          message: err instanceof Error ? err.message : 'Failed to test connection',
        },
      }));
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev);
        next.delete(integration.id);
        return next;
      });
    }
  };

  const handleSync = async (integration: IntegrationConfig) => {
    setSyncingIds((prev) => new Set(prev).add(integration.id));
    // Clear previous sync result for this integration
    setSyncResults((prev) => {
      const next = { ...prev };
      delete next[integration.id];
      return next;
    });

    try {
      const result = await triggerSync(integration.id);
      // Store sync result to display inline
      setSyncResults((prev) => ({
        ...prev,
        [integration.id]: {
          success: result.success,
          message: result.message || 'Data synchronized successfully',
        },
      }));

      // Update integration last_sync_at in state without full refresh
      if (result.success) {
        setIntegrations((prev) =>
          prev.map((int) => (int.id === integration.id ? { ...int, lastSyncAt: new Date().toISOString() } : int)),
        );
        const categorySlug = integration.integrationType.toLowerCase();
        showSuccessWithLink(
          `Sync started for ${integration.displayName}`,
          'View in System Activity',
          `/system-activity?category=${categorySlug}`,
          result.jobIds?.[0],
        );
      } else {
        showError(result.message || 'Sync failed');
      }
    } catch (err) {
      // Store error result
      const message = err instanceof Error ? err.message : 'Failed to sync data';
      setSyncResults((prev) => ({
        ...prev,
        [integration.id]: {
          success: false,
          message,
        },
      }));
      showError('Failed to start sync', message);
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(integration.id);
        return next;
      });
    }
  };

  const handleToggleHistory = async (integrationId: string) => {
    const isOpen = expandedHistory.has(integrationId);
    if (isOpen) {
      setExpandedHistory((prev) => {
        const s = new Set(prev);
        s.delete(integrationId);
        return s;
      });
      return;
    }
    setExpandedHistory((prev) => new Set(prev).add(integrationId));
    if (!syncHistoryData[integrationId]) {
      setLoadingHistory((prev) => new Set(prev).add(integrationId));
      try {
        const logs = await getSyncHistory(integrationId);
        setSyncHistoryData((prev) => ({ ...prev, [integrationId]: logs.slice(0, 8) }));
      } catch {
        setSyncHistoryData((prev) => ({ ...prev, [integrationId]: [] }));
      } finally {
        setLoadingHistory((prev) => {
          const s = new Set(prev);
          s.delete(integrationId);
          return s;
        });
      }
    }
  };

  const handleJobRowClick = async (log: UnifiedSyncLog) => {
    setLoadingJobId(log.id);
    try {
      const job = await systemActivityApi.getJob(log.id);
      setSelectedJob(job);
      setJobSheetOpen(true);
    } catch {
      showError('Could not load job details');
    } finally {
      setLoadingJobId(null);
    }
  };

  // Get connected vendor IDs to filter out from "Add New" section
  const connectedVendors = new Set(integrations.map((int) => int.vendor));

  // Visual grouping: which types appear in "Fleet Data Pipeline" section
  const FLEET_PIPELINE_TYPES: IntegrationType[] = ['TMS', 'ELD'];
  // One-active-at-a-time enforcement (independent of visual grouping)
  const SINGLE_ACTIVE_TYPES: IntegrationType[] = ['TMS', 'ELD'];
  const configuredTypes = new Set(integrations.map((i) => i.integrationType));

  // Build dynamic categories from vendor registry
  const dynamicCategories = [
    {
      type: 'ELD' as IntegrationType,
      label: 'ELD (HOS & Telematics)',
      icon: Gauge,
      color: 'blue',
      vendors: vendors.filter((v) => v.integrationType === 'ELD'),
    },
    {
      type: 'TMS' as IntegrationType,
      label: 'Transportation Management',
      icon: Package,
      color: 'purple',
      vendors: vendors.filter((v) => v.integrationType === 'TMS'),
    },
    {
      type: 'ACCOUNTING' as IntegrationType,
      label: 'Accounting',
      icon: Calculator,
      color: 'cyan',
      vendors: vendors.filter((v) => v.integrationType === 'ACCOUNTING'),
    },
    {
      type: 'LOAD_BOARD' as IntegrationType,
      label: 'Load Board',
      icon: Search,
      color: 'blue',
      vendors: vendors.filter((v) => v.integrationType === 'LOAD_BOARD'),
    },
  ];

  // Group integrations by category
  const integrationsByCategory = dynamicCategories.map((category) => ({
    ...category,
    integrations: integrations.filter((int) => int.integrationType === category.type),
  }));

  // Get stats
  const totalIntegrations = integrations.length;
  const activeIntegrations = integrations.filter((int) => int.status === 'ACTIVE').length;

  // Static Tailwind class lookup (dynamic string interpolation is purged at build time)
  const colorClasses: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-500' },
    purple: { bg: 'bg-purple-500/10 dark:bg-purple-500/20', text: 'text-purple-500' },
    green: { bg: 'bg-green-500/10 dark:bg-green-500/20', text: 'text-green-500' },
    cyan: { bg: 'bg-cyan-500/10 dark:bg-cyan-500/20', text: 'text-cyan-500' },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading integrations...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <Button onClick={loadIntegrations}>Retry</Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div>
          {totalIntegrations > 0 && (
            <div className="flex gap-2 mt-3">
              <Badge variant="outline">{activeIntegrations} Active</Badge>
              <Badge variant="muted">{totalIntegrations} Total</Badge>
            </div>
          )}
        </div>

        {/* Fleet Data Pipeline */}
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Fleet Data Pipeline</h3>
            <p className="text-xs text-muted-foreground">
              Core fleet integrations that sync drivers, vehicles, loads, HOS, and telematics data.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {integrationsByCategory
              .filter((c) => FLEET_PIPELINE_TYPES.includes(c.type))
              .map((category) => {
                const Icon = category.icon;
                const count = category.integrations.length;

                return (
                  <Card
                    key={category.type}
                    className="cursor-pointer hover:shadow-md transition-shadow border-2"
                    onClick={() => handleCategoryClick(category.type)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4 flex-1">
                          <div className={`p-3 rounded-lg ${colorClasses[category.color]?.bg ?? ''}`}>
                            <Icon className={`h-6 w-6 ${colorClasses[category.color]?.text ?? ''}`} />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg text-foreground">{category.label}</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {count === 0 ? 'No connections' : `${count} connection${count > 1 ? 's' : ''}`}
                            </p>
                            {category.integrations.length > 0 && (
                              <div className="mt-3 space-y-1">
                                {category.integrations.map((int) => (
                                  <div key={int.id} className="flex items-center gap-2 text-sm">
                                    <div
                                      className={`h-2 w-2 rounded-full ${
                                        int.status === 'ACTIVE'
                                          ? 'bg-green-500'
                                          : int.status === 'ERROR' || int.status === 'NEEDS_RECONNECT'
                                            ? 'bg-red-500'
                                            : 'bg-gray-400 dark:bg-gray-500'
                                      }`}
                                    />
                                    <span className="text-foreground font-medium">{int.displayName}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        {(() => {
                          const isOnePerType = SINGLE_ACTIVE_TYPES.includes(category.type);
                          const alreadyConfigured = configuredTypes.has(category.type);
                          const addDisabled = isOnePerType && alreadyConfigured;

                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={addDisabled}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCategoryClick(category.type);
                                    }}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              {addDisabled && (
                                <TooltipContent>
                                  <p>{category.label} already connected. Remove existing to switch providers.</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          );
                        })()}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </div>

        {/* Business Integrations */}
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Business Integrations</h3>
            <p className="text-xs text-muted-foreground">Accounting systems connected to your fleet operations.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {integrationsByCategory
              .filter((c) => !FLEET_PIPELINE_TYPES.includes(c.type))
              .map((category) => {
                const Icon = category.icon;
                const count = category.integrations.length;

                return (
                  <Card
                    key={category.type}
                    className="cursor-pointer hover:shadow-md transition-shadow border-2"
                    onClick={() => handleCategoryClick(category.type)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4 flex-1">
                          <div className={`p-3 rounded-lg ${colorClasses[category.color]?.bg ?? ''}`}>
                            <Icon className={`h-6 w-6 ${colorClasses[category.color]?.text ?? ''}`} />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg text-foreground">{category.label}</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {count === 0 ? 'No connections' : `${count} connection${count > 1 ? 's' : ''}`}
                            </p>
                            {category.integrations.length > 0 && (
                              <div className="mt-3 space-y-1">
                                {category.integrations.map((int) => (
                                  <div key={int.id} className="flex items-center gap-2 text-sm">
                                    <div
                                      className={`h-2 w-2 rounded-full ${
                                        int.status === 'ACTIVE'
                                          ? 'bg-green-500'
                                          : int.status === 'ERROR'
                                            ? 'bg-red-500'
                                            : 'bg-gray-400 dark:bg-gray-500'
                                      }`}
                                    />
                                    <span className="text-foreground font-medium">{int.displayName}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCategoryClick(category.type);
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </div>

        {/* Category Detail Dialog */}
        <Dialog open={selectedCategory !== null} onOpenChange={(open) => !open && setSelectedCategory(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedCategory && dynamicCategories.find((c) => c.type === selectedCategory)?.label}
              </DialogTitle>
            </DialogHeader>

            {selectedCategory &&
              (() => {
                const categoryIntegrations =
                  integrationsByCategory.find((c) => c.type === selectedCategory)?.integrations ?? [];
                // For single-active types, only one can be active at a time
                const isFleetType = SINGLE_ACTIVE_TYPES.includes(selectedCategory);
                const activeIntegrationId = isFleetType ? categoryIntegrations.find((i) => i.isEnabled)?.id : null;

                return (
                  <div className="space-y-4">
                    {/* Existing Connections */}
                    {categoryIntegrations.map((integration) => {
                      const isHistoryOpen = expandedHistory.has(integration.id);
                      const historyLogs = syncHistoryData[integration.id] ?? [];
                      const isHistoryLoading = loadingHistory.has(integration.id);
                      const testResult = testResults[integration.id];
                      const syncResult = syncResults[integration.id];
                      // For fleet types, disable toggle if another integration is already active
                      const canToggle = !isFleetType || !activeIntegrationId || activeIntegrationId === integration.id;

                      return (
                        <div key={integration.id} className="rounded-xl border border-border bg-card overflow-hidden">
                          {/* Card header row */}
                          <div className="flex items-center justify-between px-4 pt-4 pb-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-semibold text-foreground">{integration.displayName}</h4>
                                  <Badge
                                    variant={integration.status === 'ACTIVE' ? 'default' : 'muted'}
                                    className="text-xs"
                                  >
                                    {integration.status}
                                  </Badge>
                                  {integration.status === 'NEEDS_RECONNECT' && (
                                    <Badge variant="destructive" className="text-xs">
                                      Reconnect Required
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {integration.vendor.replace(/_/g, ' ')}
                                  {integration.lastSyncAt && (
                                    <span className="ml-2">
                                      · Last sync {formatRelativeTime(integration.lastSyncAt)}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            {/* Active toggle — right side of header */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Switch
                                    checked={integration.isEnabled}
                                    disabled={!canToggle}
                                    onCheckedChange={async (enabled) => {
                                      try {
                                        await updateIntegration(integration.id, { isEnabled: enabled });
                                        setIntegrations((prev) =>
                                          prev.map((int) =>
                                            int.id === integration.id ? { ...int, isEnabled: enabled } : int,
                                          ),
                                        );
                                        showSuccess(enabled ? 'Integration enabled' : 'Integration paused');
                                      } catch (err) {
                                        showError(
                                          'Error',
                                          err instanceof Error ? err.message : 'Failed to update integration',
                                        );
                                      }
                                    }}
                                  />
                                  <span className="text-xs text-muted-foreground w-12 ml-1">
                                    {integration.isEnabled ? 'Active' : 'Paused'}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              {!canToggle && (
                                <TooltipContent side="left" className="text-xs">
                                  Disable the active integration first
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </div>

                          {/* Action row — adapted per connection method */}
                          {(() => {
                            const vendorMeta = vendors.find((v) => v.id === integration.vendor);
                            const methods = vendorMeta?.connectionMethods ?? [];
                            const isFileUploadOnly =
                              methods.length > 0 && methods.every((m) => m.type === 'file_upload');

                            return (
                              <div className="flex items-center gap-1 px-4 pb-3 flex-wrap">
                                {!isFileUploadOnly && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 text-xs gap-1.5"
                                      onClick={() => handleTestConnection(integration)}
                                      loading={testingIds.has(integration.id)}
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      Test
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 text-xs gap-1.5"
                                      onClick={() => handleSync(integration)}
                                      loading={syncingIds.has(integration.id)}
                                    >
                                      <RefreshCw className="h-3.5 w-3.5" />
                                      Sync
                                    </Button>
                                  </>
                                )}
                                {isFileUploadOnly && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs gap-1.5"
                                    onClick={() => {
                                      setSelectedCategory(null);
                                      setTimeout(() => handleConfigure(integration), 100);
                                    }}
                                  >
                                    <UploadCloud className="h-3.5 w-3.5" />
                                    Upload
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs gap-1.5"
                                  onClick={() => {
                                    setSelectedCategory(null);
                                    setTimeout(() => handleConfigure(integration), 100);
                                  }}
                                >
                                  <Settings2 className="h-3.5 w-3.5" />
                                  Configure
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs gap-1.5"
                                  onClick={() => handleToggleHistory(integration.id)}
                                >
                                  {isHistoryOpen ? (
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  )}
                                  History
                                </Button>
                                {/* Delete — pushed to the right */}
                                <div className="ml-auto">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                    onClick={() => handleDelete(integration)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Inline result banners */}
                          {(testResult || syncResult) && (
                            <div className="px-4 pb-3 space-y-2">
                              {testResult && (
                                <div
                                  className={`flex items-start gap-2 px-3 py-2 rounded-md text-xs border ${
                                    testResult.success
                                      ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900 text-green-800 dark:text-green-200'
                                      : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 text-red-800 dark:text-red-200'
                                  }`}
                                >
                                  {testResult.success ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                  ) : (
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                  )}
                                  {testResult.message}
                                </div>
                              )}
                              {syncResult && (
                                <div
                                  className={`flex items-start gap-2 px-3 py-2 rounded-md text-xs border ${
                                    syncResult.success
                                      ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-200'
                                      : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 text-red-800 dark:text-red-200'
                                  }`}
                                >
                                  {syncResult.success ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                  ) : (
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                  )}
                                  {syncResult.message}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Inline sync history */}
                          {isHistoryOpen && (
                            <>
                              <Separator />
                              <div className="px-4 py-3">
                                <p className="text-xs font-medium text-muted-foreground mb-2">Recent Syncs</p>
                                {isHistoryLoading ? (
                                  <div className="flex items-center gap-2 py-3 text-muted-foreground">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span className="text-xs">Loading history...</span>
                                  </div>
                                ) : historyLogs.length === 0 ? (
                                  <p className="text-xs text-muted-foreground py-2">No sync history yet.</p>
                                ) : (
                                  <div className="space-y-1">
                                    {historyLogs.map((log) => (
                                      <div
                                        key={log.id}
                                        className="flex items-center gap-3 py-1.5 text-xs rounded px-1 cursor-pointer hover:bg-accent/50 transition-colors"
                                        onClick={() => handleJobRowClick(log)}
                                      >
                                        {loadingJobId === log.id ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                                        ) : log.status === 'success' ? (
                                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                        ) : log.status === 'failed' ? (
                                          <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                        ) : (
                                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        )}
                                        <span className="text-muted-foreground w-16 shrink-0">
                                          {formatRelativeTime(log.startedAt)}
                                        </span>
                                        <Badge variant="outline" className="text-xs h-5 px-1.5">
                                          {log.syncType}
                                        </Badge>
                                        <span className="text-muted-foreground">{log.recordsProcessed} records</span>
                                        {log.durationMs && (
                                          <span className="text-muted-foreground ml-auto">
                                            {(log.durationMs / 1000).toFixed(1)}s
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}

                    {/* Add New Connection — only shown if unconnected vendors remain */}
                    {(() => {
                      const availableVendors = (
                        dynamicCategories.find((c) => c.type === selectedCategory)?.vendors ?? []
                      ).filter((v) => !connectedVendors.has(v.id));
                      if (!isLoadingVendors && availableVendors.length === 0) return null;
                      return (
                        <div className="pt-4 border-t border-border">
                          <h4 className="font-semibold text-foreground mb-3">Add New Connection</h4>
                          <div className="space-y-2">
                            {isLoadingVendors ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-sm text-muted-foreground">Loading vendors...</span>
                              </div>
                            ) : (
                              dynamicCategories
                                .find((c) => c.type === selectedCategory)
                                ?.vendors.filter((vendor) => !connectedVendors.has(vendor.id))
                                .map((vendor) => {
                                  // For single-active types, block adding if one already exists
                                  const isBlocked = isFleetType && categoryIntegrations.length > 0;

                                  return (
                                    <Button
                                      key={vendor.id}
                                      variant="ghost"
                                      onClick={() => !isBlocked && handleAddIntegration(vendor.id, selectedCategory)}
                                      disabled={isBlocked}
                                      className={`w-full h-auto flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                                        isBlocked
                                          ? 'border-border bg-muted/30 cursor-not-allowed opacity-60'
                                          : 'border-border hover:bg-muted/50 hover:border-foreground/20'
                                      }`}
                                    >
                                      <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                          <span className="font-medium text-foreground">{vendor.displayName}</span>
                                          {isBlocked && (
                                            <Badge variant="muted" className="text-xs">
                                              One allowed
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 font-normal">
                                          {vendor.description}
                                        </p>
                                      </div>
                                      {!isBlocked && <Plus className="h-4 w-4 text-muted-foreground" />}
                                    </Button>
                                  );
                                })
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
          </DialogContent>
        </Dialog>
        {/* Configure Integration Sheet */}
        <Sheet open={configureDialog.open} onOpenChange={(open) => !open && handleCloseDialog()}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-2xl p-6 overflow-y-auto"
            onInteractOutside={(e) => e.preventDefault()}
            pinnable
            resizable
            defaultPinned
          >
            <SheetHeader>
              <SheetTitle>{configureDialog.integration ? 'Configure Integration' : 'Add Integration'}</SheetTitle>
            </SheetHeader>
            <SheetKeyboardHint />
            <div className="mt-6">
              {(configureDialog.integration || (configureDialog.integrationType && configureDialog.vendor)) && (
                <ConfigureIntegrationForm
                  integration={configureDialog.integration}
                  integrationType={configureDialog.integrationType}
                  vendor={configureDialog.vendor}
                  onSuccess={() => {
                    handleCloseDialog();
                    handleRefresh();
                  }}
                  onCancel={handleCloseDialog}
                />
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={deleteDialog.open}
          onOpenChange={(open) => !open && setDeleteDialog({ open: false, integration: null })}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Integration?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{deleteDialog.integration?.displayName}&quot;? This will stop all
                automatic syncing for this integration.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Job Detail Sheet — opened when clicking a sync history row */}
        <JobDetailSheet
          job={selectedJob}
          open={jobSheetOpen}
          onOpenChange={(open) => {
            setJobSheetOpen(open);
            if (!open) setSelectedJob(null);
          }}
          onRetry={() => {}}
          onCancel={() => {}}
          isRetrying={false}
          isCancelling={false}
        />
      </div>
    </TooltipProvider>
  );
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return `${Math.floor(diffMins / 1440)}d ago`;
}
