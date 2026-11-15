import { Inject, Injectable, Optional } from '@nestjs/common';

/**
 * One availability rule: the tools it covers, and whether they can be offered right now. Use it for a tool whose
 * channel or vendor may not be configured (an SMS tool with no sending number, say), so the model is never offered,
 * and never promises, an action that cannot be delivered.
 */
export interface ToolAvailabilityRule {
  readonly tools: readonly string[];
  isAvailable(): boolean;
}

/**
 * The rule set. The starter binds an empty list in `AgentContractModule`. A product replaces that binding with a
 * factory that injects what its rules read, for example:
 *
 *   { provide: TOOL_AVAILABILITY_RULES, inject: [SmsService],
 *     useFactory: (sms: SmsService) => [{ tools: [ToolNames.SEND_SMS], isAvailable: () => sms.isConfigured() }] }
 */
export const TOOL_AVAILABILITY_RULES = Symbol('TOOL_AVAILABILITY_RULES');

/**
 * Platform-level availability of tools, independent of scopes, roles and plans. A tool that is not available is left
 * out of `tools/list` and of every chat toolset. This hides a tool; it is not a permission check. Who may run a tool
 * is the pipeline's job (scope, role, plan, confirmation).
 */
@Injectable()
export class ToolAvailabilityService {
  private readonly rules: readonly ToolAvailabilityRule[];

  constructor(@Optional() @Inject(TOOL_AVAILABILITY_RULES) rules?: readonly ToolAvailabilityRule[]) {
    this.rules = rules ?? [];
  }

  /** False when any rule that covers the tool says it cannot be offered now. A tool no rule covers is available. */
  isAvailable(toolName: string): boolean {
    return this.rules.every((rule) => !rule.tools.includes(toolName) || rule.isAvailable());
  }
}
