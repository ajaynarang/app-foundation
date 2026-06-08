import { HttpStatus } from '@nestjs/common';
import { McpServerController } from '../mcp-server.controller';

describe('McpServerController', () => {
  let controller: McpServerController;
  let mockMcpService: any;

  beforeEach(() => {
    mockMcpService = {
      handleRequest: jest.fn().mockResolvedValue(undefined),
    };
    controller = new McpServerController(mockMcpService);
  });

  describe('handleMcpRequest (POST)', () => {
    it('should delegate to service with oauth user', async () => {
      const oauthUser = {
        userId: 'user_1',
        tenantDbId: 1,
        role: 'DISPATCHER',
        scopes: ['fleet:read'],
        clientId: 'client_1',
      };
      const req = { oauthUser } as any;
      const res = {} as any;

      await controller.handleMcpRequest(req, res);

      expect(mockMcpService.handleRequest).toHaveBeenCalledWith(req, res, oauthUser);
    });
  });

  describe('handleSseStream (GET)', () => {
    it('should return 405 Method Not Allowed', async () => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.handleSseStream(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.METHOD_NOT_ALLOWED);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Method Not Allowed',
        message: expect.stringContaining('stateless mode'),
      });
    });
  });

  describe('terminateSession (DELETE)', () => {
    it('should return ok status', async () => {
      const res = {
        json: jest.fn(),
      } as any;

      await controller.terminateSession(res);

      expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
    });
  });
});
