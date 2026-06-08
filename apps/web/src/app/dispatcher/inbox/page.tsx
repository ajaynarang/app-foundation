'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Search, Unplug, Bookmark, FileInput, Mail, Sparkles, ChevronDown } from 'lucide-react';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { PageHeader, PageTabs, PageTabsList, PageTabsTrigger, PageToolbar } from '@/shared/components/page-chrome';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@sally/ui/components/ui/dropdown-menu';

import { usePlan } from '@/features/platform/plans/hooks/use-plan';
import { useIntegrations } from '@/features/integrations/hooks/use-integrations';
import { usePendingTenders } from '@/features/edi/hooks/use-edi';
import { LoadBoardSearchBar } from '@/features/integrations/load-board/components/LoadBoardSearchBar';
import { LoadBoardResults, type SortKey } from '@/features/integrations/load-board/components/LoadBoardResults';
import { DriverRecommendationsView } from '@/features/integrations/load-board/components/DriverRecommendationsView';
import { LoadBoardDetailSheet } from '@/features/integrations/load-board/components/LoadBoardDetailSheet';
import { ImportLoadSheet } from '@/features/integrations/load-board/components/ImportLoadSheet';
import { SaveSearchDialog } from '@/features/integrations/load-board/components/SaveSearchDialog';
import { SavedSearchesSheet } from '@/features/integrations/load-board/components/SavedSearchesSheet';
import { useLoadBoardSearch } from '@/features/integrations/load-board/hooks/use-load-board-search';
import { useNlpSearch } from '@/features/integrations/load-board/hooks/use-nlp-search';
import { useImportLoad } from '@/features/integrations/load-board/hooks/use-import-load';
import { useRecommendations } from '@/features/integrations/load-board/hooks/use-recommendations';
import { useSavedSearches } from '@/features/integrations/load-board/hooks/use-saved-searches';
import { TendersList } from '@/features/edi/components/TendersList';
import { EmailInboxTab } from '@/features/email-intake/components/EmailInboxTab';
import { useEmailThreads } from '@/features/email-intake/hooks';
import type {
  LoadBoardSearchParams,
  LoadBoardListing,
  LoadBoardSearchResult,
} from '@/features/integrations/load-board/types';
import type { SavedSearch } from '@/features/integrations/load-board/api';

type TabValue = 'dat' | 'tenders' | 'email';
type SearchMode = 'search' | 'drivers';

export default function LoadIntelPage() {
  const { hasFeature } = usePlan();
  const hasDat = hasFeature('load_board');
  const hasEdi = hasFeature('edi_integration');
  const hasEmailIngest = hasFeature('email_intake');

  const availableTabs: TabValue[] = [];
  if (hasEmailIngest) availableTabs.push('email');
  if (hasDat) availableTabs.push('dat');
  if (hasEdi) availableTabs.push('tenders');

  // Core state
  const [searchParams, setSearchParams] = useState<LoadBoardSearchParams | null>(null);
  const [nlpResult, setNlpResult] = useState<LoadBoardSearchResult | null>(null);
  const [resolvedParams, setResolvedParams] = useState<LoadBoardSearchParams | null>(null);
  const [selectedListing, setSelectedListing] = useState<LoadBoardListing | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savedSearchesOpen, setSavedSearchesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>(availableTabs[0] ?? 'dat');
  const [sortBy, setSortBy] = useState<SortKey>('ratePerMile');
  const [emailSettingsOpen, setEmailSettingsOpen] = useState(false);

  // Search mode: 'search' (manual) or 'drivers' (recommendations)
  const [searchMode, setSearchMode] = useState<SearchMode>('search');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  // Data hooks
  const { data: integrations } = useIntegrations();
  const { data: searchResult, isLoading: isSearching } = useLoadBoardSearch(searchParams);
  const nlpSearch = useNlpSearch();
  const importLoad = useImportLoad();
  const { data: recommendations = [], isLoading: isRecsLoading } = useRecommendations(searchMode === 'drivers');
  const { data: savedSearches } = useSavedSearches();
  const { data: pendingTenders } = usePendingTenders({ enabled: hasEdi });
  const tenderCount = pendingTenders?.length ?? 0;
  const { data: emailThreadsData } = useEmailThreads(hasEmailIngest ? { status: 'PENDING', limit: '1' } : undefined);
  const emailPendingCount = emailThreadsData?.total ?? 0;

  const isDatConnected = integrations?.some((i) => i.vendor === 'DAT_LOAD_BOARD' && i.isEnabled);

  const activeResult = nlpResult ?? searchResult;
  const hasSearched = searchParams !== null || nlpResult !== null;

  // Handlers
  const handleStructuredSearch = useCallback((params: LoadBoardSearchParams) => {
    setSearchParams(params);
    setNlpResult(null);
    setResolvedParams(null);
    setSelectedListing(null);
    setDetailOpen(false);
    setSearchMode('search');
  }, []);

  const handleNlpSearch = useCallback(
    (query: string) => {
      setSearchParams(null);
      setNlpResult(null);
      setResolvedParams(null);
      setSelectedListing(null);
      setDetailOpen(false);
      setSearchMode('search');
      nlpSearch.mutate(query, {
        onSuccess: (result) => setNlpResult(result),
      });
    },
    [nlpSearch],
  );

  const handleSelect = useCallback((listing: LoadBoardListing) => {
    setSelectedListing(listing);
    setDetailOpen(true);
  }, []);

  const handleImport = useCallback(() => {
    setDetailOpen(false);
    setImportSheetOpen(true);
  }, []);

  const handleRunSavedSearch = useCallback((params: LoadBoardSearchParams) => {
    setSearchParams(params);
    setNlpResult(null);
    setResolvedParams(params);
    setSelectedListing(null);
    setDetailOpen(false);
    setActiveTab('dat');
    setSearchMode('search');
  }, []);

  const handleSwitchToDrivers = useCallback(() => {
    setSearchMode('drivers');
    setSelectedDriverId(null);
  }, []);

  const _handleSwitchToSearch = useCallback(() => {
    setSearchMode('search');
    setSelectedDriverId(null);
  }, []);

  // Upsell
  if (!hasDat && !hasEdi && !hasEmailIngest) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="rounded-full bg-muted p-4">
          <Sparkles className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Unlock Load Intel</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Search the DAT spot market and receive inbound EDI tenders from brokers. Upgrade your plan or add the EDI
          integration to get started.
        </p>
        <Link href="/settings/subscription">
          <Button>View Plans</Button>
        </Link>
      </div>
    );
  }

  const showTabBar = availableTabs.length > 1;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <PageHeader
        title="Inbox"
        subtitle="Inbound loads, tenders, and emails — all in one place"
        settingsLabel="Email inbox settings"
        onSettings={hasEmailIngest && activeTab === 'email' ? () => setEmailSettingsOpen(true) : undefined}
      />

      {/* Source tabs */}
      {showTabBar && (
        <PageTabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="mt-3">
          <PageToolbar
            tabs={
              <PageTabsList>
                {hasEmailIngest && (
                  <PageTabsTrigger value="email">
                    <Mail className="mr-1.5 h-3.5 w-3.5" />
                    Email
                    {emailPendingCount > 0 && (
                      <Badge
                        variant="muted"
                        className="ml-1.5 h-5 min-w-5 px-1 text-xs bg-sky-500/20 text-sky-400 border-0"
                      >
                        {emailPendingCount}
                      </Badge>
                    )}
                  </PageTabsTrigger>
                )}
                {hasDat && (
                  <PageTabsTrigger value="dat">
                    <Search className="mr-1.5 h-3.5 w-3.5" />
                    Search
                  </PageTabsTrigger>
                )}
                {hasEdi && (
                  <PageTabsTrigger value="tenders">
                    <FileInput className="mr-1.5 h-3.5 w-3.5" />
                    Tenders
                    {tenderCount > 0 && (
                      <Badge
                        variant="muted"
                        className="ml-1.5 h-5 min-w-5 px-1 text-xs bg-violet-500/20 text-violet-400 border-0"
                      >
                        {tenderCount}
                      </Badge>
                    )}
                  </PageTabsTrigger>
                )}
              </PageTabsList>
            }
            // DAT tab's saved-search tools live in the toolbar right cluster (Zone 2).
            secondaryActions={
              activeTab === 'dat' && hasDat && isDatConnected ? (
                <>
                  <SavedSearchesMenu
                    savedSearches={savedSearches}
                    onRun={handleRunSavedSearch}
                    onManage={() => setSavedSearchesOpen(true)}
                  />
                  {searchParams && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSaveDialogOpen(true)}
                      title="Save current search"
                    >
                      <Bookmark className="h-4 w-4 sm:mr-1.5" />
                      <span className="hidden sm:inline">Save search</span>
                    </Button>
                  )}
                </>
              ) : undefined
            }
          />
        </PageTabs>
      )}

      {/* Tab content */}
      <div className="flex flex-1 flex-col min-h-0">
        {/* DAT Search tab */}
        {activeTab === 'dat' && hasDat && (
          <div className="flex flex-1 flex-col min-h-0">
            {/* Not connected */}
            {integrations && !isDatConnected ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="rounded-full bg-muted p-4">
                  <Unplug className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Connect DAT to search available loads</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Set up your DAT Load Board integration in Settings to start searching for spot market loads.
                </p>
                <Link href="/settings/integrations">
                  <Button>Go to Integrations</Button>
                </Link>
              </div>
            ) : (
              <>
                {/* Search bar */}
                <div className="py-4">
                  <LoadBoardSearchBar
                    onSearch={handleStructuredSearch}
                    onNlpSearch={handleNlpSearch}
                    onFindForMyDrivers={handleSwitchToDrivers}
                    isSearching={isSearching || nlpSearch.isPending}
                    isNlpParsing={nlpSearch.isPending}
                    isFindingDrivers={searchMode === 'drivers' && isRecsLoading}
                    resolvedParams={resolvedParams}
                  />
                </div>

                {/* Results area */}
                {searchMode === 'search' ? (
                  <>
                    <LoadBoardResults
                      listings={activeResult?.listings || []}
                      selectedId={selectedListing?.externalId || null}
                      onSelect={handleSelect}
                      total={activeResult?.total || 0}
                      sortBy={sortBy}
                      onSortChange={setSortBy}
                      isLoading={isSearching || nlpSearch.isPending}
                      hasSearched={hasSearched}
                    />
                  </>
                ) : (
                  <DriverRecommendationsView
                    recommendations={recommendations}
                    isLoading={isRecsLoading}
                    selectedDriverId={selectedDriverId}
                    onSelectDriver={setSelectedDriverId}
                    onSelectListing={handleSelect}
                    selectedListingId={selectedListing?.externalId || null}
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* Tenders tab */}
        {activeTab === 'tenders' && hasEdi && <TendersList />}

        {/* Email tab */}
        {activeTab === 'email' && hasEmailIngest && (
          <EmailInboxTab settingsOpen={emailSettingsOpen} onSettingsOpenChange={setEmailSettingsOpen} />
        )}
      </div>

      {/* Detail Sheet */}
      <LoadBoardDetailSheet
        listing={selectedListing}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onImport={handleImport}
        isImporting={importLoad.isPending}
      />

      {/* Import Sheet */}
      <ImportLoadSheet listing={selectedListing} open={importSheetOpen} onOpenChange={setImportSheetOpen} />

      {/* Save Search Dialog */}
      {searchParams && (
        <SaveSearchDialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen} searchParams={searchParams} />
      )}

      {/* Saved Searches Management Sheet */}
      <SavedSearchesSheet
        open={savedSearchesOpen}
        onOpenChange={setSavedSearchesOpen}
        onRunSearch={handleRunSavedSearch}
      />
    </div>
  );
}

/** Saved-search picker for the DAT tab — lives in the Inbox toolbar right cluster. */
function SavedSearchesMenu({
  savedSearches,
  onRun,
  onManage,
}: {
  savedSearches: SavedSearch[] | undefined;
  onRun: (params: LoadBoardSearchParams) => void;
  onManage: () => void;
}) {
  const count = savedSearches?.length ?? 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Bookmark className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Saved</span>
          {count > 0 && <span className="ml-1 text-2xs text-muted-foreground">({count})</span>}
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[280px]">
        {count > 0 ? (
          <>
            {savedSearches!.map((search) => {
              const params = search.searchParams;
              const origin = params.origin ? `${params.origin.city}, ${params.origin.state}` : 'Any';
              const dest = params.destination ? `${params.destination.city}, ${params.destination.state}` : 'Anywhere';
              return (
                <DropdownMenuItem
                  key={search.savedSearchId}
                  onClick={() => onRun(params)}
                  className="flex flex-col items-start gap-0.5 py-2"
                >
                  <span className="text-sm font-medium">{search.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {origin} → {dest}
                  </span>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onManage} className="text-xs text-muted-foreground">
              Manage saved searches...
            </DropdownMenuItem>
          </>
        ) : (
          <div className="px-3 py-4 text-center">
            <p className="text-xs text-muted-foreground">
              No saved searches yet. Search for loads, then save to monitor lanes.
            </p>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
