'use client';

import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { CheckCircle2, XCircle, AlertTriangle, Minus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { CategorySummary, TypeSummary } from '../types';
import { CATEGORY_SLUGS } from '../types';

interface FlatRow extends TypeSummary {
  category: string;
  categorySlug: string;
  categoryDisplayName: string;
}

interface TypeBreakdownTableProps {
  categories: CategorySummary[] | undefined;
  isLoading: boolean;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  onTypeClick: (categorySlug: string, type: string) => void;
}

function StatusIndicator({ row }: { row: FlatRow }) {
  // Last run status based indicator
  if (!row.lastRunAt) {
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  }

  if (row.lastRunStatus === 'FAILED') {
    return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
  }

  if (row.lastRunStatus === 'COMPLETED') {
    // Check staleness for scheduled jobs (>2hrs)
    if (row.schedule && row.schedule !== 'Manual') {
      const hoursSince = (Date.now() - new Date(row.lastRunAt).getTime()) / (1000 * 60 * 60);
      if (hoursSince > 2) {
        return <AlertTriangle className="h-4 w-4 text-yellow-500 dark:text-yellow-400" />;
      }
    }
    return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
  }

  // cancelled or unknown
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

export function TypeBreakdownTable({
  categories,
  isLoading,
  selectedCategory,
  onCategoryChange,
  onTypeClick,
}: TypeBreakdownTableProps) {
  // Flatten categories into rows
  const allRows = useMemo<FlatRow[]>(() => {
    if (!categories) return [];
    return categories.flatMap((cat) =>
      cat.types.map((t) => ({
        ...t,
        category: cat.category,
        categorySlug: CATEGORY_SLUGS[cat.category] ?? cat.category,
        categoryDisplayName: cat.displayName,
      })),
    );
  }, [categories]);

  // Filter by category
  const filteredRows = useMemo(() => {
    if (selectedCategory === 'all') return allRows;
    return allRows.filter((r) => r.categorySlug === selectedCategory);
  }, [allRows, selectedCategory]);

  // Category filter options
  const categoryOptions = useMemo(() => {
    if (!categories) return [];
    return categories.map((cat) => ({
      value: CATEGORY_SLUGS[cat.category] ?? cat.category,
      label: cat.displayName,
    }));
  }, [categories]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Select value={selectedCategory} onValueChange={onCategoryChange}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categoryOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">
          {filteredRows.length} {filteredRows.length === 1 ? 'job type' : 'job types'}
        </span>
      </div>

      {/* Table */}
      {filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No job types found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden sm:table-cell">Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden md:table-cell">Schedule</TableHead>
              <TableHead className="hidden md:table-cell">Last Run</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Today</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((row) => (
              <TableRow
                key={`${row.category}:${row.type}`}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
                onClick={() => onTypeClick(row.categorySlug, row.type)}
              >
                <TableCell className="hidden sm:table-cell text-muted-foreground">{row.categoryDisplayName}</TableCell>
                <TableCell className="font-medium text-foreground">{row.displayName}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{row.schedule ?? '-'}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {row.lastRunAt ? formatDistanceToNow(new Date(row.lastRunAt), { addSuffix: true }) : 'Never'}
                </TableCell>
                <TableCell>
                  <StatusIndicator row={row} />
                </TableCell>
                <TableCell className="text-right hidden sm:table-cell text-muted-foreground">
                  {row.todaySucceeded}/{row.todayTotal}
                  {row.todayFailed > 0 && (
                    <span className="text-red-600 dark:text-red-400 ml-1">({row.todayFailed} failed)</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
