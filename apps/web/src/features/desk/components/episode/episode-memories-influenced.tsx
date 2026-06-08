'use client';

import { useMemo } from 'react';

import { useMemories } from '../../hooks/use-memories';
import type { AgentKey } from '../../types';

interface EpisodeMemoriesInfluencedProps {
  episodeId: string;
  /**
   * Plain-string agent key from the episode payload — narrowed to
   * `AgentKey` for the memories query. Backend always returns one of
   * the canonical agent keys for an episode's owner agent.
   */
  agentKey: string;
  /**
   * Memory IDs hydrate retrieved for this run, persisted on the episode
   * row at hydrate time. When present, drives the "Memories that
   * influenced this episode" card. When absent (legacy episodes pre-T7),
   * we fall back to the sourceEpisodeId-based "Sally learned from this"
   * card, which surfaces memories *written* from this episode.
   */
  retrievedMemoryIds?: string[];
}

/**
 * Renders one of two memory cards on the episode sheet:
 *
 *   1. **Memories that influenced this episode** — when
 *      `retrievedMemoryIds` is non-empty. These are the memories
 *      hydrate fed to the LLM for this run.
 *   2. **Sally learned from this** — fallback for legacy / Handled-mode
 *      episodes that don't carry retrievedMemoryIds. Surfaces memories
 *      *written* from this episode (sourceEpisodeId match).
 *
 * Returns null when both buckets are empty so dispatchers don't see an
 * empty shell.
 */
export function EpisodeMemoriesInfluenced({ episodeId, agentKey, retrievedMemoryIds }: EpisodeMemoriesInfluencedProps) {
  const hasRetrievedIds = retrievedMemoryIds !== undefined && retrievedMemoryIds.length > 0;

  // Hot path: hydrate the agent's full active memory list and filter by
  // ID. TanStack Query dedupes the request when multiple episodes for
  // the same agent are open.
  const { data: agentMemories } = useMemories(
    { agentKey: agentKey as AgentKey, activeOnly: true, limit: 200 },
    { enabled: hasRetrievedIds },
  );

  // Fallback: pull memories written FROM this episode.
  const { data: sourceMemories } = useMemories(
    { agentKey: agentKey as AgentKey, sourceEpisodeId: episodeId, activeOnly: true, limit: 20 },
    { enabled: !hasRetrievedIds },
  );

  const display = useMemo(() => {
    if (hasRetrievedIds) {
      const ids = new Set(retrievedMemoryIds);
      return (agentMemories?.rows ?? []).filter((m) => ids.has(m.id));
    }
    return sourceMemories?.rows ?? [];
  }, [hasRetrievedIds, retrievedMemoryIds, agentMemories?.rows, sourceMemories?.rows]);

  if (display.length === 0) return null;

  const heading = hasRetrievedIds ? 'Memories that influenced this episode' : 'Sally learned from this';

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{heading}</h4>
      <ul className="mt-2 space-y-1.5 text-sm text-foreground">
        {display.map((m) => (
          <li key={m.id} className="leading-relaxed">
            {m.content}
          </li>
        ))}
      </ul>
    </section>
  );
}
