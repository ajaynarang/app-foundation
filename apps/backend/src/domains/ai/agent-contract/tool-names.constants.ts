/**
 * Central registry of every MCP @Tool name exposed by the assistant.
 *
 * Why this exists:
 *   - `@Tool({ name: '...' })` is declared at each tool class but the SAME
 *     string may be repeated by hand in write-tool sets and allowlists. Drift
 *     is inevitable.
 *   - This is the single source of truth; callers import from here. Renaming a
 *     tool = one-line change in this file.
 *
 * Invariant (enforced by ScopeRegistryService at boot): every registered
 * @Tool name should appear here. New tool → add an entry here AND in its
 * @Tool decorator.
 *
 * The starter ships only the two sample tools. Add your tool names below.
 */
export const ToolNames = {
  // ─── Meta / system ───────────────────────────────────────────────────────
  HEALTH_CHECK: 'health-check',
  // ─── Knowledge base ──────────────────────────────────────────────────────
  SEARCH_KB: 'search-kb',
  GET_PRODUCT_INFO: 'get-product-info',
} as const;

export type ToolName = (typeof ToolNames)[keyof typeof ToolNames];

export const TOOL_NAMES_LIST: readonly ToolName[] = Object.values(ToolNames) as ToolName[];
