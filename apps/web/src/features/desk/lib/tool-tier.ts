/**
 * Client-side tool tier derivation. Mirrors the backend's deriveToolTier
 * but uses tool-name heuristics because the v1 UI spec endpoint does not
 * yet echo the scope string. When the backend grows a /desk/tools/tiers
 * endpoint (or the UI spec echoes scope), switch this to a lookup.
 */
export type ToolTier = 'read' | 'standard' | 'sensitive';

const SENSITIVE_TOOLS = new Set<string>([
  'send-email',
  'send-sms',
  'send-bulk-email',
  'record-payment',
  'void-invoice',
  'delete-driver',
]);

export function deriveToolTier(toolName: string): ToolTier {
  if (SENSITIVE_TOOLS.has(toolName)) return 'sensitive';
  if (toolName.startsWith('get-') || toolName.startsWith('query-') || toolName.startsWith('list-')) {
    return 'read';
  }
  return 'standard';
}
