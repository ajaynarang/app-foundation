import { HttpException, HttpStatus } from '@nestjs/common';
import { McpRootController } from '../mcp-root.controller';

describe('McpRootController', () => {
  let controller: McpRootController;
  let mockMcpService: any;

  beforeEach(() => {
    mockMcpService = {
      handleRequest: jest.fn().mockResolvedValue(undefined),
    };
    controller = new McpRootController(mockMcpService);
  });

  describe('handleMcpRequest (POST)', () => {
    it('should delegate to service with oauth user', async () => {
      const oauthUser = {
        userId: 'user_1',
        tenantDbId: 1,
        role: 'MEMBER',
        scopes: ['platform:read'],
        clientId: 'client_1',
      };
      const req = { oauthUser } as any;
      const res = {} as any;

      await controller.handleMcpRequest(req, res);

      expect(mockMcpService.handleRequest).toHaveBeenCalledWith(req, res, oauthUser);
    });
  });

  describe('handleSseStream (GET)', () => {
    it('should answer 405 Method Not Allowed through the error envelope', async () => {
      const error = await controller.handleSseStream().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.METHOD_NOT_ALLOWED);
      expect((error as HttpException).message).toContain('stateless mode');
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
