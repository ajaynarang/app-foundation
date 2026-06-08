import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ShieldDisputeTool } from '../shield-dispute.tool';

describe('ShieldDisputeTool', () => {
  let tool: ShieldDisputeTool;
  let mockPrisma: { user: { findFirst: jest.Mock } };
  let mockShieldService: { disputeFinding: jest.Mock };

  const tenantId = 1;
  const firebaseUid = 'firebase-uid-abc';
  const numericUserId = 42;
  const findingId = 'clxxx123finding';
  const reason = 'Driver was actually off-duty during this period';

  beforeEach(() => {
    mockPrisma = {
      user: { findFirst: jest.fn() },
    };
    mockShieldService = { disputeFinding: jest.fn() };
    tool = new ShieldDisputeTool(mockPrisma as any, mockShieldService as any);

    // Default: user found
    mockPrisma.user.findFirst.mockResolvedValue({ id: numericUserId });
    // Default: dispute succeeds
    mockShieldService.disputeFinding.mockResolvedValue({
      id: findingId,
      isDisputed: true,
    });
  });

  it('returns error when _tenantId is missing', async () => {
    const result = await tool.disputeShieldFinding({
      findingId,
      reason,
      _tenantId: undefined,
      _userId: firebaseUid,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(mockShieldService.disputeFinding).not.toHaveBeenCalled();
  });

  it('returns error when _userId is missing', async () => {
    const result = await tool.disputeShieldFinding({
      findingId,
      reason,
      _tenantId: tenantId,
      _userId: undefined,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(mockShieldService.disputeFinding).not.toHaveBeenCalled();
  });

  it('returns error when acting user is not found in DB', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const result = await tool.disputeShieldFinding({
      findingId,
      reason,
      _tenantId: tenantId,
      _userId: 'unknown-firebase-uid',
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/user not found/i);
    expect(mockShieldService.disputeFinding).not.toHaveBeenCalled();
  });

  it('happy path — calls service with correct args and returns success shape', async () => {
    const result = await tool.disputeShieldFinding({
      findingId,
      reason,
      _tenantId: tenantId,
      _userId: firebaseUid,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.findingId).toBe(findingId);
    expect(parsed.message).toContain(findingId);
    expect(parsed.message).toContain('disputed');
    expect(mockShieldService.disputeFinding).toHaveBeenCalledWith(tenantId, findingId, numericUserId, reason);
  });

  it('surfaces service errors (not found, already resolved, already disputed) as user-friendly messages', async () => {
    mockShieldService.disputeFinding.mockRejectedValue(new NotFoundException(`Shield finding ${findingId} not found`));
    const result = await tool.disputeShieldFinding({
      findingId,
      reason,
      _tenantId: tenantId,
      _userId: firebaseUid,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain(findingId);

    // also verify BadRequestException (already resolved)
    mockShieldService.disputeFinding.mockRejectedValue(
      new BadRequestException('Cannot dispute a resolved finding. Reopen via the UI first.'),
    );
    const result2 = await tool.disputeShieldFinding({
      findingId,
      reason,
      _tenantId: tenantId,
      _userId: firebaseUid,
    });
    const parsed2 = JSON.parse(result2.content[0].text);
    expect(parsed2.error).toMatch(/resolved/i);
  });
});
