'use client';

import { Tabs, TabsList, TabsTrigger } from '@sally/ui/components/ui/tabs';
import { Badge } from '@sally/ui/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { FeedbackStatusEnum } from '@sally/shared-types';
import type { FeedbackStats } from '../types';

const FeedbackStatus = FeedbackStatusEnum.enum;

interface FeedbackFiltersProps {
  status: string;
  category: string;
  tenantId: string;
  onStatusChange: (status: string) => void;
  onCategoryChange: (category: string) => void;
  onTenantChange: (tenantId: string) => void;
  stats?: FeedbackStats;
  tenants?: { id: number; companyName: string }[];
}

export function FeedbackFilters({
  status,
  category,
  tenantId,
  onStatusChange,
  onCategoryChange,
  onTenantChange,
  stats,
  tenants,
}: FeedbackFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <Tabs value={status} onValueChange={onStatusChange} className="w-full sm:w-auto">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          {/* Values are the canonical uppercase FeedbackStatus enum the API filters on. */}
          <TabsTrigger value={FeedbackStatus.NEW} className="gap-1.5">
            New
            {(stats?.new ?? 0) > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 px-1 text-2xs">
                {stats?.new}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value={FeedbackStatus.REVIEWED}>Reviewed</TabsTrigger>
          <TabsTrigger value={FeedbackStatus.RESOLVED}>Resolved</TabsTrigger>
        </TabsList>
      </Tabs>

      <Select value={category} onValueChange={onCategoryChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          <SelectItem value="uncategorized">Uncategorized</SelectItem>
          <SelectItem value="bug">Bug</SelectItem>
          <SelectItem value="idea">Idea</SelectItem>
          <SelectItem value="general">General</SelectItem>
        </SelectContent>
      </Select>

      {tenants && tenants.length > 0 && (
        <Select value={tenantId} onValueChange={onTenantChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tenant" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tenants</SelectItem>
            {tenants.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.companyName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
