export interface DurableEventJobData {
  id: string;
  event: string;
  tenantId: string;
  data: unknown;
  actor: { id: string; type: string; label: string | null } | null;
  correlationId: string | null;
  causationId: string | null;
  version: number;
  timestamp: string;
}
