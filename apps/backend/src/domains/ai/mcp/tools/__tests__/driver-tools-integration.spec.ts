import { PERSONA_CONFIGS } from '../../../../../domains/prompting/prompts/persona/persona.config';
import { BASE_DRIVER } from '../../../../../domains/prompting/prompts/persona/base-prompts';
import { ToolNames } from '../../../agent-contract/tool-names.constants';

/** Write tools that require HITL confirmation — mirrors McpToolService.WRITE_TOOLS */
const WRITE_TOOLS = new Set<string>([
  ToolNames.ACKNOWLEDGE_ALERT,
  ToolNames.RESOLVE_ALERT,
  ToolNames.PLAN_ROUTE,
  ToolNames.REPORT_DELAY,
  ToolNames.REPORT_ARRIVAL,
  ToolNames.REPORT_FUEL_STOP,
  ToolNames.UPDATE_STOP_STATUS,
  ToolNames.REPORT_ISSUE,
]);

describe('Driver Tools Integration', () => {
  const driverConfig = PERSONA_CONFIGS.driver;

  it('should include all 17 driver tools', () => {
    expect(driverConfig.allowedTools).toEqual(
      expect.arrayContaining([
        ToolNames.HEALTH_CHECK,
        ToolNames.GET_MY_ROUTE,
        ToolNames.GET_MY_HOS,
        ToolNames.GET_MY_NEXT_STOP,
        ToolNames.REPORT_DELAY,
        ToolNames.REPORT_ARRIVAL,
        ToolNames.REPORT_FUEL_STOP,
        ToolNames.UPDATE_STOP_STATUS,
        ToolNames.REPORT_ISSUE,
        ToolNames.GET_MY_SETTLEMENT,
        ToolNames.GET_MY_LOADS,
        ToolNames.GET_MY_PAY_STRUCTURE,
        ToolNames.REQUEST_DOCUMENT_UPLOAD,
        ToolNames.SEARCH_KB,
        ToolNames.GET_PRODUCT_INFO,
        ToolNames.CREATE_SUPPORT_TICKET,
        ToolNames.GET_CAPABILITIES,
      ]),
    );
    expect(driverConfig.allowedTools).toHaveLength(17);
  });

  it('should have maxToolSteps of 6 for write tool confirmation flow', () => {
    expect(driverConfig.maxToolSteps).toBe(6);
  });

  it('should use fast model (Haiku) for driver', () => {
    expect(driverConfig.modelAlias).toBe('fast');
  });

  it('should have base prompt mentioning confirmation rules', () => {
    expect(BASE_DRIVER).toContain('CONFIRMATION RULES');
    expect(BASE_DRIVER).toContain('confirm-action');
  });

  it('should not give driver access to dispatcher tools', () => {
    expect(driverConfig.allowedTools).not.toContain(ToolNames.QUERY_LOADS);
    expect(driverConfig.allowedTools).not.toContain(ToolNames.GET_DRIVER_HOS);
    expect(driverConfig.allowedTools).not.toContain(ToolNames.ACKNOWLEDGE_ALERT);
    expect(driverConfig.allowedTools).not.toContain(ToolNames.PLAN_ROUTE);
  });

  it('should have all driver action tools in WRITE_TOOLS set', () => {
    const driverWriteTools = [
      ToolNames.REPORT_DELAY,
      ToolNames.REPORT_ARRIVAL,
      ToolNames.REPORT_FUEL_STOP,
      ToolNames.UPDATE_STOP_STATUS,
      ToolNames.REPORT_ISSUE,
    ];
    for (const tool of driverWriteTools) {
      expect(WRITE_TOOLS.has(tool)).toBe(true);
    }
  });

  it('should not have driver read tools in WRITE_TOOLS set', () => {
    const driverReadTools = [
      ToolNames.GET_MY_ROUTE,
      ToolNames.GET_MY_HOS,
      ToolNames.GET_MY_NEXT_STOP,
      ToolNames.GET_MY_SETTLEMENT,
      ToolNames.GET_MY_LOADS,
      ToolNames.GET_MY_PAY_STRUCTURE,
      ToolNames.SEARCH_KB,
      ToolNames.GET_PRODUCT_INFO,
      ToolNames.GET_CAPABILITIES,
    ];
    for (const tool of driverReadTools) {
      expect(WRITE_TOOLS.has(tool)).toBe(false);
    }
  });
});
