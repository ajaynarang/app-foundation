import { DRIVER_CONVERSATION_USER_MODE, driverConversationId } from '../driver-messages.constants';

describe('driver-messages.constants', () => {
  it('has the expected user mode', () => {
    expect(DRIVER_CONVERSATION_USER_MODE).toBe('driver_dispatch');
  });

  it('builds a deterministic conversation id', () => {
    expect(driverConversationId(7, 'DRV-001')).toBe('driver-dispatch-7-DRV-001');
  });

  it('is stable for the same tenant + driver', () => {
    expect(driverConversationId(3, 'DRV-XYZ')).toBe(driverConversationId(3, 'DRV-XYZ'));
  });
});
