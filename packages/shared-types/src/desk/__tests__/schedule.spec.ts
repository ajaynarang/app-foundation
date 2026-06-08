import {
  DeskScheduleStateSchema,
  UpdateDeskScheduleRequestSchema,
  type DeskScheduleState,
  type UpdateDeskScheduleRequest,
} from '../schedule';

describe('Desk schedule shared-types', () => {
  it('DeskScheduleStateSchema parses the tenant master-switch state with timezone', () => {
    const state: DeskScheduleState = DeskScheduleStateSchema.parse({ enabled: true, timezone: 'America/Chicago' });
    expect(state.enabled).toBe(true);
    expect(state.timezone).toBe('America/Chicago');
  });

  it('DeskScheduleStateSchema requires the timezone string', () => {
    expect(() => DeskScheduleStateSchema.parse({ enabled: true })).toThrow();
  });

  it('UpdateDeskScheduleRequestSchema requires the enabled boolean', () => {
    const req: UpdateDeskScheduleRequest = UpdateDeskScheduleRequestSchema.parse({ enabled: false });
    expect(req.enabled).toBe(false);
    expect(() => UpdateDeskScheduleRequestSchema.parse({})).toThrow();
  });
});
