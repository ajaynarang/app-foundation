import type { DomainEvent } from '@appshore/kernel/infrastructure/events/domain-event';

/** What one record contributes to the index. `text` is Markdown or plain text; it is chunked, embedded and stored. */
export interface SearchSubjectContent {
  /** Shown as the hit's label, and prefixed to every chunk so an isolated chunk keeps its context. */
  title: string;
  text: string;
  /** Web-app route of the record, when it has a page. */
  href?: string | null;
}

/**
 * One kind of tenant record the search index covers. A product implements this per kind (an order, a ticket, a
 * policy) and lists the implementations in `platform-glue/search/search-subjects.ts`; the foundation ships none.
 *
 * The index is derived data: `load` is the only source of truth. It is called on every change and on a rebuild, and
 * its answer replaces whatever the index held for that record.
 */
export interface SearchSubject {
  /** Stored in `search_chunks.subject_type` and used as the filter name. Lower-case kebab, at most 50 characters. */
  readonly type: string;
  /** Domain events (names from the event registry) after which records of this kind are re-read. */
  readonly events: readonly string[];
  /** The public ids of the records an event touched. Called only for the events listed above. */
  subjectIdsFor(event: DomainEvent): string[];
  /**
   * The record as it should be found now, or null when it must not be found (deleted, archived, a draft, another
   * tenant's): the index then drops it. Scope every query to `tenantId`.
   */
  load(tenantId: number, subjectId: string): Promise<SearchSubjectContent | null>;
  /** Every record id of this kind in the tenant, for a rebuild. */
  listIds(tenantId: number): Promise<string[]>;
}

/** Injection token for the registered `SearchSubject`s. Empty in the starter. */
export const SEARCH_SUBJECTS = Symbol('SEARCH_SUBJECTS');

export const SUBJECT_TYPE_PATTERN = /^[a-z][a-z0-9-]{0,49}$/;
export const MAX_SUBJECT_ID_LENGTH = 100;

/** Fails at boot on a subject the table cannot hold or that would shadow another. */
export function assertSubjects(subjects: readonly SearchSubject[]): void {
  const seen = new Set<string>();
  for (const subject of subjects) {
    if (!SUBJECT_TYPE_PATTERN.test(subject.type))
      throw new Error(`Search subject type "${subject.type}" must be lower-case kebab, at most 50 characters`);
    if (seen.has(subject.type)) throw new Error(`Search subject type "${subject.type}" is registered twice`);
    seen.add(subject.type);
  }
}
