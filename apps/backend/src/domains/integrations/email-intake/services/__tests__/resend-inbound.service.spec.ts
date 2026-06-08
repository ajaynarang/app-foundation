import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ResendInboundService } from '../resend-inbound.service';

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('ResendInboundService', () => {
  let service: ResendInboundService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResendInboundService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-resend-api-key'),
          },
        },
      ],
    }).compile();

    service = module.get<ResendInboundService>(ResendInboundService);
  });

  describe('getEmail', () => {
    it('should fetch email from Resend API with auth header', async () => {
      const mockEmail = {
        id: 'email-123',
        from: 'sender@test.com',
        to: ['recipient@test.com'],
        subject: 'Test',
        text: 'Hello',
        html: '<p>Hello</p>',
        headers: {},
        message_id: '<msg-1@test.com>',
        attachments: [],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockEmail),
      });

      const result = await service.getEmail('email-123');

      expect(result).toEqual(mockEmail);
      expect(mockFetch).toHaveBeenCalledWith('https://api.resend.com/emails/receiving/email-123', {
        headers: { Authorization: 'Bearer test-resend-api-key' },
      });
    });

    it('should throw on non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(service.getEmail('bad-id')).rejects.toThrow('Failed to retrieve email — please try again');
    });
  });

  describe('downloadAttachment', () => {
    it('should fetch metadata then download binary', async () => {
      const fakeBuffer = new ArrayBuffer(10);

      // First call: metadata
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          download_url: 'https://presigned.s3.com/file',
          expires_at: '2026-01-01T00:00:00Z',
        }),
      });

      // Second call: download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(fakeBuffer),
      });

      const result = await service.downloadAttachment('email-1', 'att-1');

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.resend.com/emails/receiving/email-1/attachments/att-1',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-resend-api-key' },
        }),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(2, 'https://presigned.s3.com/file');
    });

    it('should throw if metadata response is not OK', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(service.downloadAttachment('email-1', 'att-1')).rejects.toThrow(
        'Failed to retrieve email attachment — please try again',
      );
    });

    it('should throw if download_url is missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ expires_at: '2026-01-01' }),
      });

      await expect(service.downloadAttachment('email-1', 'att-1')).rejects.toThrow(
        'Failed to retrieve email attachment — please try again',
      );
    });

    it('should throw if binary download fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          download_url: 'https://presigned.s3.com/file',
          expires_at: '2026-01-01',
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(service.downloadAttachment('email-1', 'att-1')).rejects.toThrow(
        'Failed to download email attachment — please try again',
      );
    });
  });
});
