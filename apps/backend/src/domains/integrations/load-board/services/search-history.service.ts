import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import type { LoadBoardSearchParams } from '@sally/shared-types';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';

export interface SearchHistoryEntry {
  id: string;
  origin: { city: string; state: string } | null;
  destination: { city: string; state: string } | null;
  equipment: string[];
  minRate: number | null;
  searchedAt: string;
  searchCount: number;
  label: string;
}

const MAX_ENTRIES = 50;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

@Injectable()
export class SearchHistoryService {
  private readonly logger = new Logger(SearchHistoryService.name);

  constructor(private readonly cache: SallyCacheService) {}

  /**
   * Log a search — increment count if same params, otherwise add new entry.
   */
  async logSearch(userId: number, params: LoadBoardSearchParams): Promise<void> {
    const key = this.cacheKey(userId);
    const entries = await this.getEntries(key);
    const id = this.hashParams(params);

    const existing = entries.find((e) => e.id === id);
    if (existing) {
      existing.searchCount++;
      existing.searchedAt = new Date().toISOString();
    } else {
      entries.unshift({
        id,
        origin: params.origin ? { city: params.origin.city, state: params.origin.state } : null,
        destination: params.destination ? { city: params.destination.city, state: params.destination.state } : null,
        equipment: params.equipmentType || [],
        minRate: params.minRate ?? null,
        searchedAt: new Date().toISOString(),
        searchCount: 1,
        label: this.buildLabel(params),
      });
    }

    // LRU eviction
    const trimmed = entries.slice(0, MAX_ENTRIES);
    await this.cache.set(key, trimmed, CACHE_TTL_MS);
  }

  /**
   * Get search history for a user — recent and frequent.
   */
  async getHistory(
    userId: number,
    query?: string,
  ): Promise<{ recent: SearchHistoryEntry[]; frequent: SearchHistoryEntry[] }> {
    const key = this.cacheKey(userId);
    const entries = await this.getEntries(key);

    let filtered = entries;
    if (query && query.trim().length > 0) {
      const q = query.trim().toLowerCase();
      filtered = entries.filter((e) => e.label.toLowerCase().includes(q));
    }

    const recent = [...filtered]
      .sort((a, b) => new Date(b.searchedAt).getTime() - new Date(a.searchedAt).getTime())
      .slice(0, 10);

    const frequent = [...filtered]
      .sort((a, b) => b.searchCount - a.searchCount)
      .filter((e) => e.searchCount > 1)
      .slice(0, 5);

    return { recent, frequent };
  }

  /**
   * Clear all search history for a user.
   */
  async clearHistory(userId: number): Promise<void> {
    await this.cache.del(this.cacheKey(userId));
  }

  private cacheKey(userId: number): string {
    return buildKey('sally:loadboard', 'search-history', userId);
  }

  private async getEntries(key: string): Promise<SearchHistoryEntry[]> {
    const cached = await this.cache.get<SearchHistoryEntry[]>(key);
    return cached || [];
  }

  private hashParams(params: LoadBoardSearchParams): string {
    const normalized = {
      o: params.origin ? `${params.origin.city}:${params.origin.state}` : '',
      d: params.destination ? `${params.destination.city}:${params.destination.state}` : '',
      e: (params.equipmentType || []).sort().join(','),
      r: params.minRate ?? '',
    };
    return createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 12);
  }

  private buildLabel(params: LoadBoardSearchParams): string {
    const parts: string[] = [];

    if (params.origin) {
      parts.push(`${params.origin.city}, ${params.origin.state}`);
    }

    if (params.destination) {
      parts.push(`→ ${params.destination.city}, ${params.destination.state}`);
    } else if (params.origin) {
      parts.push('→ Anywhere');
    }

    if (params.equipmentType?.length) {
      const labels: Record<string, string> = {
        van: 'Van',
        reefer: 'Reefer',
        flatbed: 'Flatbed',
        step_deck: 'Step Deck',
        power_only: 'Power Only',
      };
      parts.push(params.equipmentType.map((t) => labels[t] || t).join(', '));
    }

    if (params.minRate) {
      parts.push(`$${params.minRate}+`);
    }

    return parts.join(' · ');
  }
}
