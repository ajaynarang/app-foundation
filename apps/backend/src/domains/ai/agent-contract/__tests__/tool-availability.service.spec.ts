import { Test } from '@nestjs/testing';
import { ToolNames } from '../tool-names.constants';
import {
  TOOL_AVAILABILITY_RULES,
  ToolAvailabilityService,
  type ToolAvailabilityRule,
} from '../tool-availability.service';

describe('ToolAvailabilityService', () => {
  it('offers every tool when no rule is bound (the starter ships an empty rule set)', () => {
    const service = new ToolAvailabilityService();
    expect(service.isAvailable(ToolNames.CREATE_SUPPORT_TICKET)).toBe(true);
    expect(service.isAvailable('anything')).toBe(true);
  });

  describe('with a rule', () => {
    let configured: boolean;
    const rule: ToolAvailabilityRule = {
      tools: [ToolNames.CREATE_SUPPORT_TICKET],
      isAvailable: () => configured,
    };

    async function serviceWith(rules: ToolAvailabilityRule[]): Promise<ToolAvailabilityService> {
      const mod = await Test.createTestingModule({
        providers: [ToolAvailabilityService, { provide: TOOL_AVAILABILITY_RULES, useValue: rules }],
      }).compile();
      return mod.get(ToolAvailabilityService);
    }

    it('withholds a covered tool while the rule says no, and offers it once it says yes', async () => {
      const service = await serviceWith([rule]);
      configured = false;
      expect(service.isAvailable(ToolNames.CREATE_SUPPORT_TICKET)).toBe(false);
      configured = true;
      expect(service.isAvailable(ToolNames.CREATE_SUPPORT_TICKET)).toBe(true);
    });

    it('leaves tools the rule does not cover available', async () => {
      const service = await serviceWith([rule]);
      configured = false;
      expect(service.isAvailable(ToolNames.LIST_SUPPORT_TICKETS)).toBe(true);
    });

    it('withholds a tool when any one of several rules covering it says no', async () => {
      const service = await serviceWith([
        { tools: [ToolNames.HEALTH_CHECK], isAvailable: () => true },
        { tools: [ToolNames.HEALTH_CHECK], isAvailable: () => false },
      ]);
      expect(service.isAvailable(ToolNames.HEALTH_CHECK)).toBe(false);
    });
  });
});
