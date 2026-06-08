import type { DocumentExpiry } from '@sally/shared-types';

import type { HydrateMemoryItem, HydratePreflightResult } from '../../shared-steps/step.types';

/**
 * Input/output shapes for the Document Expiry workflow steps. Mirrors the
 * AR Follow-up `step.types.ts` layout but for driver-credential findings.
 *
 * The gate is job-blind: it hands this responsibility its OWN hydrate
 * output verbatim and `conditionsEvaluator` reads `entity.finding.*`
 * directly — no pre-mapped gate entity. The shared close step folds the
 * generic optional `relationshipRef` this output carries
 * (`{ driverId, credentialType }`) into the memory entityRef; responsibilities
 * that omit it fall back to the close step's default behaviour.
 */

export interface DocumentExpiryHydrateInput {
  episodeId: string;
  responsibilityKey: 'document_expiry';
}

/** Resolved contact for one recipient (driver or admin). */
export interface DocumentExpiryContact {
  email: string | null;
  phone: string | null; // E.164 when present
}

/** The hydrated facts of the credential-expiry finding under review. */
export interface DocumentExpiryFinding {
  findingId: string;
  driverId: string;
  driverName: string;
  severity: DocumentExpiry.DocumentExpirySeverity;
  credentialType: DocumentExpiry.DocumentExpiryCredentialType;
  credentialLabel: string;
  /** ISO date (YYYY-MM-DD) the credential expires/expired. */
  dueDate: string | null;
  daysUntilExpiry: number | null;
  recommendation: string | null;
}

export interface DocumentExpiryHydrateEntity {
  finding: DocumentExpiryFinding;
  driverContact: DocumentExpiryContact;
  adminContact: DocumentExpiryContact;
  /** Reminders sent for this (driver, credential) within the lookback window. */
  priorReminderCount: number;
}

export interface DocumentExpiryHydrateOutput {
  entity: DocumentExpiryHydrateEntity;
  memories: HydrateMemoryItem[];
  preflight: HydratePreflightResult;
  /**
   * Counterparty keys the shared close step folds into the memory entityRef
   * — `{ driverId, credentialType }` so reinforcement is scoped to the
   * driver+credential, not a one-off finding id. Always emitted by the
   * hydrate step; read structurally by the job-blind close step (same
   * `relationshipRef` seam AR + settlement use). The gate ignores it — it
   * reads `entity.finding.*` directly.
   */
  relationshipRef?: { driverId: string; credentialType: DocumentExpiry.DocumentExpiryCredentialType };
}

export type DocumentExpiryPerceiveOutput = DocumentExpiry.DocumentExpiryPerceive;
export type DocumentExpiryDecideOutput = DocumentExpiry.DocumentExpiryDecide;
export type DocumentExpiryDraftOutput = DocumentExpiry.DocumentExpiryDraft;
