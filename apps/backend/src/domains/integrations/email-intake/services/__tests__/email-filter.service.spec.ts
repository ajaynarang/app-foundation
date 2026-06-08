// Mock Prisma/pg so tests run without a real DB or generated client
jest.mock('@prisma/client', () => ({
  PrismaClient: class PrismaClient {},
  EmailIngestFilterResult: {
    PENDING: 'PENDING',
    PASSED: 'PASSED',
    SENDER_UNKNOWN: 'SENDER_UNKNOWN',
    WRONG_TYPE: 'WRONG_TYPE',
    TOO_SMALL: 'TOO_SMALL',
    TOO_LARGE: 'TOO_LARGE',
    DUPLICATE: 'DUPLICATE',
    NOT_RATECON: 'NOT_RATECON',
    BLOCKED_NAME: 'BLOCKED_NAME',
  },
}));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));
jest.mock('pg', () => ({ default: { Pool: jest.fn() } }));

import { Test, TestingModule } from '@nestjs/testing';
import { EmailFilterService, FilterInput } from '../email-filter.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

const VALID_INPUT: FilterInput = {
  tenantId: 1,
  senderEmail: 'broker@approved.com',
  fileName: 'ratecon_12345.pdf',
  mimeType: 'application/pdf',
  fileSize: 50 * 1024, // 50 KB
  contentHash: 'abc123',
};

const mockSettings = {
  tenantId: 1,
  inboundAddress: 'test@inbound.sally.app',
  isEnabled: true,
  approvedDomains: ['approved.com'],
  autoApproveCustomerDomains: true,
  unknownSenderPolicy: 'HOLD',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  emailIngestSettings: {
    findUnique: jest.fn(),
  },
  customer: {
    findFirst: jest.fn(),
  },
  emailIngestAttachment: {
    findFirst: jest.fn(),
  },
};

describe('EmailFilterService', () => {
  let service: EmailFilterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailFilterService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<EmailFilterService>(EmailFilterService);

    // Default: no duplicate, settings present, no customers
    mockPrisma.emailIngestAttachment.findFirst.mockResolvedValue(null);
    mockPrisma.emailIngestSettings.findUnique.mockResolvedValue(mockSettings);
    mockPrisma.customer.findFirst.mockResolvedValue(null);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('returns PASSED for a valid ratecon PDF from an approved sender', async () => {
    mockPrisma.emailIngestAttachment.findFirst.mockResolvedValue(null);
    mockPrisma.emailIngestSettings.findUnique.mockResolvedValue(mockSettings);
    mockPrisma.customer.findFirst.mockResolvedValue(null);

    const result = await service.filter(VALID_INPUT);

    expect(result.result).toBe('PASSED');
    expect(result.reason).toBeNull();
  });

  it('returns WRONG_TYPE for a non-PDF attachment', async () => {
    const result = await service.filter({
      ...VALID_INPUT,
      mimeType: 'image/png',
    });
    expect(result.result).toBe('WRONG_TYPE');
    expect(result.reason).toContain('image/png');
  });

  it('returns TOO_SMALL for a file below 10KB', async () => {
    const result = await service.filter({ ...VALID_INPUT, fileSize: 5 * 1024 });
    expect(result.result).toBe('TOO_SMALL');
    expect(result.reason).toContain('minimum');
  });

  it('returns BLOCKED_NAME for an insurance filename', async () => {
    const result = await service.filter({
      ...VALID_INPUT,
      fileName: 'insurance_cert.pdf',
    });
    expect(result.result).toBe('BLOCKED_NAME');
    expect(result.reason).toContain('insurance_cert.pdf');
  });

  it('returns SENDER_UNKNOWN for an unknown sender with HOLD policy', async () => {
    mockPrisma.emailIngestAttachment.findFirst.mockResolvedValue(null);
    mockPrisma.emailIngestSettings.findUnique.mockResolvedValue({
      ...mockSettings,
      approvedDomains: [],
      autoApproveCustomerDomains: false,
      unknownSenderPolicy: 'HOLD',
    });
    mockPrisma.customer.findFirst.mockResolvedValue(null);

    const result = await service.filter({
      ...VALID_INPUT,
      senderEmail: 'unknown@stranger.com',
    });

    expect(result.result).toBe('SENDER_UNKNOWN');
    expect(result.reason).toContain('stranger.com');
  });

  it('returns PASSED for a sender approved via customer domain match', async () => {
    mockPrisma.emailIngestAttachment.findFirst.mockResolvedValue(null);
    mockPrisma.emailIngestSettings.findUnique.mockResolvedValue({
      ...mockSettings,
      approvedDomains: [],
      autoApproveCustomerDomains: true,
      unknownSenderPolicy: 'HOLD',
    });
    mockPrisma.customer.findFirst.mockResolvedValue({ id: 1 });

    const result = await service.filter({
      ...VALID_INPUT,
      senderEmail: 'ops@broker.com',
    });

    expect(result.result).toBe('PASSED');
    expect(result.reason).toBeNull();
  });

  it('returns DUPLICATE for an attachment with an existing content hash', async () => {
    mockPrisma.emailIngestAttachment.findFirst.mockResolvedValue({
      id: 'existing-id',
    });

    const result = await service.filter(VALID_INPUT);

    expect(result.result).toBe('DUPLICATE');
    expect(result.reason).toContain('abc123');
  });
});
