import { SupportTicketTool } from '../support-ticket.tool';

describe('SupportTicketTool', () => {
  let tool: SupportTicketTool;
  let mockSupportService: any;
  let mockPrisma: any;

  beforeEach(() => {
    mockSupportService = {
      createTicket: jest.fn().mockResolvedValue({
        ticketNumber: 'TKT-001',
        status: 'OPEN',
      }),
    };

    mockPrisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 42 }),
      },
      conversation: {
        findFirst: jest.fn().mockResolvedValue({ id: 10 }),
      },
    };

    tool = new SupportTicketTool(mockSupportService, mockPrisma);
  });

  describe('createSupportTicket', () => {
    const baseArgs = {
      subject: 'Cannot generate invoice',
      description: 'User tried to generate invoice for load L-1045 but got error',
      category: 'TECHNICAL',
      priority: 'HIGH',
    };

    it('should return error when tenantId is missing', async () => {
      const result = await tool.createSupportTicket({
        ...baseArgs,
        _userId: 'user_1',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('No tenant context');
    });

    it('should return error when userId is missing', async () => {
      const result = await tool.createSupportTicket({
        ...baseArgs,
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('No tenant context');
    });

    it('should return error when user is not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const result = await tool.createSupportTicket({
        ...baseArgs,
        _tenantId: 1,
        _userId: 'user_1',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('User not found');
    });

    it('should create ticket successfully without conversation', async () => {
      const result = await tool.createSupportTicket({
        ...baseArgs,
        _tenantId: 1,
        _userId: 'user_1',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.ticketNumber).toBe('TKT-001');
      expect(parsed.status).toBe('OPEN');
      expect(parsed.message).toContain('TKT-001');
      expect(mockSupportService.createTicket).toHaveBeenCalledWith(1, 42, {
        subject: baseArgs.subject,
        description: baseArgs.description,
        category: baseArgs.category,
        priority: baseArgs.priority,
        conversationId: undefined,
        relatedEntities: undefined,
      });
    });

    it('should create ticket with conversation context', async () => {
      const result = await tool.createSupportTicket({
        ...baseArgs,
        _tenantId: 1,
        _userId: 'user_1',
        _conversationId: 'conv_abc',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.ticketNumber).toBe('TKT-001');
      expect(mockSupportService.createTicket).toHaveBeenCalledWith(1, 42, {
        subject: baseArgs.subject,
        description: baseArgs.description,
        category: baseArgs.category,
        priority: baseArgs.priority,
        conversationId: 10,
        relatedEntities: undefined,
      });
    });

    it('should create ticket with related entities', async () => {
      const relatedEntities = [
        { type: 'load', id: 'ld_1', label: 'Load #L-4521' },
        { type: 'invoice', id: 'inv_1' },
      ];
      const result = await tool.createSupportTicket({
        ...baseArgs,
        relatedEntities,
        _tenantId: 1,
        _userId: 'user_1',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.ticketNumber).toBe('TKT-001');
      expect(mockSupportService.createTicket).toHaveBeenCalledWith(1, 42, expect.objectContaining({ relatedEntities }));
    });

    it('should handle conversation not found gracefully', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      const result = await tool.createSupportTicket({
        ...baseArgs,
        _tenantId: 1,
        _userId: 'user_1',
        _conversationId: 'conv_nonexistent',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.ticketNumber).toBe('TKT-001');
      expect(mockSupportService.createTicket).toHaveBeenCalledWith(
        1,
        42,
        expect.objectContaining({ conversationId: undefined }),
      );
    });

    it('should return error when service throws', async () => {
      mockSupportService.createTicket.mockRejectedValue(new Error('DB connection failed'));
      const result = await tool.createSupportTicket({
        ...baseArgs,
        _tenantId: 1,
        _userId: 'user_1',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('DB connection failed');
    });

    it('should return generic error message when error has no message', async () => {
      mockSupportService.createTicket.mockRejectedValue({});
      const result = await tool.createSupportTicket({
        ...baseArgs,
        _tenantId: 1,
        _userId: 'user_1',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('Failed to create support ticket');
    });
  });
});
