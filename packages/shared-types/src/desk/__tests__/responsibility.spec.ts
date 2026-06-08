import {
  DeskResponsibilityDetailSchema,
  UpdateDeskResponsibilityRequestSchema,
  UpdateResponsibilityAutonomyRequestSchema,
  type DeskResponsibilityDetail,
  type UpdateDeskResponsibilityRequest,
} from '../responsibility';

describe('DeskResponsibility shared-types — notesForSally retired', () => {
  const baseDetail = {
    key: 'ar_followup' as const,
    agentKey: 'sally-billing' as const,
    title: 'Nudge customers on overdue invoices',
    description: null,
    lifecycle: 'AVAILABLE' as const,
    enabled: true,
    autonomyEnabled: false,
    trustLevel: 'SUPERVISED' as const,
    openEpisodeCount: 0,
    pendingApprovalCount: 0,
    lastRunAt: null,
    conditions: {},
  };

  it('DeskResponsibilityDetailSchema strips notesForSally on parse', () => {
    const parsed = DeskResponsibilityDetailSchema.parse({
      ...baseDetail,
      notesForSally: 'this should be ignored',
    });
    expect((parsed as Record<string, unknown>).notesForSally).toBeUndefined();
  });

  it('DeskResponsibilityDetail TS type does not expose notesForSally', () => {
    // Type-level proof: assigning a value with notesForSally must error.
    const detail = {} as DeskResponsibilityDetail;
    // @ts-expect-error — notesForSally is not part of DeskResponsibilityDetail
    detail.notesForSally = 'x';
  });

  it('UpdateDeskResponsibilityRequestSchema strips notesForSally on parse', () => {
    const parsed = UpdateDeskResponsibilityRequestSchema.parse({
      enabled: true,
      notesForSally: 'this should be ignored',
    });
    expect((parsed as Record<string, unknown>).notesForSally).toBeUndefined();
  });

  it('UpdateDeskResponsibilityRequest TS type does not expose notesForSally', () => {
    const req = {} as UpdateDeskResponsibilityRequest;
    // @ts-expect-error — notesForSally is no longer on the request type
    req.notesForSally = 'x';
  });

  it('DeskResponsibilityDetailSchema carries autonomyEnabled', () => {
    const parsed = DeskResponsibilityDetailSchema.parse({ ...baseDetail, autonomyEnabled: true });
    expect(parsed.autonomyEnabled).toBe(true);
  });

  it('DeskResponsibilityDetailSchema requires autonomyEnabled', () => {
    const { autonomyEnabled: _omit, ...withoutAutonomy } = baseDetail;
    expect(() => DeskResponsibilityDetailSchema.parse(withoutAutonomy)).toThrow();
  });

  it('UpdateResponsibilityAutonomyRequestSchema accepts a boolean toggle', () => {
    expect(UpdateResponsibilityAutonomyRequestSchema.parse({ autonomyEnabled: false })).toEqual({
      autonomyEnabled: false,
    });
  });
});
