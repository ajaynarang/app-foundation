import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { IntegrationsController } from '../integrations.controller';
import { IntegrationsService } from '../integrations.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { JobService } from '../../../infrastructure/queue/job.service';
import { QUEUE_NAMES } from '../../../infrastructure/queue/queue.constants';
import { VENDOR_REGISTRY, getVendorOAuth, getVendorCredentialFields } from '../vendor-registry';

describe('IntegrationsController - Vendor Registry', () => {
  let controller: IntegrationsController;

  // Simulate what getVendorRegistry() returns: strip envPrefix from OAuth methods
  const mockVendors = Object.values(VENDOR_REGISTRY).map((v) => ({
    ...v,
    connectionMethods: v.connectionMethods.map((m) => {
      if (m.type === 'oauth') {
        const { envPrefix: _envPrefix, ...safeConfig } = m.config;
        return { type: 'oauth' as const, config: safeConfig };
      }
      return m;
    }),
    displayOrder: 0,
  }));

  const mockIntegrationsService = {
    getVendorRegistry: jest.fn().mockResolvedValue(mockVendors),
  };
  const mockPrismaService = {};
  const mockJobService = {};
  const mockQueue = { add: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntegrationsController],
      providers: [
        { provide: IntegrationsService, useValue: mockIntegrationsService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JobService, useValue: mockJobService },
        {
          provide: getQueueToken(QUEUE_NAMES.TELEMETRY),
          useValue: mockQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.VENDOR_DATA),
          useValue: mockQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.FINANCE),
          useValue: mockQueue,
        },
      ],
    }).compile();

    controller = module.get<IntegrationsController>(IntegrationsController);
  });

  describe('GET /vendors', () => {
    it('should return all vendors from registry', async () => {
      const vendors = await controller.getVendorRegistry();

      expect(vendors).toBeInstanceOf(Array);
      expect(vendors.length).toBeGreaterThanOrEqual(6);

      // PROJECT44_TMS: credentials only (client_credentials grant)
      const project44 = vendors.find((v) => v.id === 'PROJECT44_TMS');
      expect(project44).toBeDefined();
      expect(project44?.displayName).toBe('project44');
      expect(project44?.integrationType).toBe('TMS');
      expect(project44?.connectionMethods).toHaveLength(1);
      expect(project44?.connectionMethods[0].type).toBe('credentials');

      // SAMSARA_ELD: OAuth + credentials fallback
      const samsara = vendors.find((v) => v.id === 'SAMSARA_ELD');
      expect(samsara).toBeDefined();
      expect(samsara?.displayName).toBe('Samsara');
      expect(samsara?.connectionMethods).toHaveLength(2);
      expect(samsara?.connectionMethods[0].type).toBe('oauth');
      expect(samsara?.connectionMethods[1].type).toBe('credentials');
    });

    it('should include credential fields in credentials connection method', async () => {
      const vendors = await controller.getVendorRegistry();
      const project44 = vendors.find((v) => v.id === 'PROJECT44_TMS');
      const credMethod = project44?.connectionMethods.find((m) => m.type === 'credentials');

      expect(credMethod?.type).toBe('credentials');
      if (credMethod?.type === 'credentials') {
        const clientIdField = credMethod.fields.find((f) => f.name === 'clientId');
        expect(clientIdField).toMatchObject({
          name: 'clientId',
          label: 'Client ID',
          type: 'text',
          required: true,
        });
        expect(clientIdField?.helpText).toContain('OAuth 2.0');
      }
    });

    it('should include OAuth config for QUICKBOOKS', async () => {
      const vendors = await controller.getVendorRegistry();
      const qb = vendors.find((v) => v.id === 'QUICKBOOKS');

      expect(qb?.connectionMethods).toHaveLength(1);
      const oauthMethod = qb?.connectionMethods[0];
      expect(oauthMethod?.type).toBe('oauth');
      if (oauthMethod?.type === 'oauth') {
        expect(oauthMethod.config.callbackQueryParams).toEqual(['realmId']);
        expect(oauthMethod.config.scopes).toEqual(['com.intuit.quickbooks.accounting']);
      }
    });

    it('should include OAuth + credentials for ELD vendors', async () => {
      const vendors = await controller.getVendorRegistry();

      const samsara = vendors.find((v) => v.id === 'SAMSARA_ELD');
      expect(samsara?.connectionMethods.some((m) => m.type === 'oauth')).toBe(true);

      const motive = vendors.find((v) => v.id === 'MOTIVE_ELD');
      expect(motive?.connectionMethods.some((m) => m.type === 'oauth')).toBe(true);
      expect(motive?.connectionMethods.some((m) => m.type === 'credentials')).toBe(true);
    });

    it('should strip envPrefix from OAuth config (security)', async () => {
      const vendors = await controller.getVendorRegistry();
      const qb = vendors.find((v) => v.id === 'QUICKBOOKS');
      const oauthMethod = qb?.connectionMethods.find((m) => m.type === 'oauth');

      // envPrefix should NOT be exposed to frontend
      expect((oauthMethod as any)?.config?.envPrefix).toBeUndefined();
    });
  });

  describe('Helper accessors', () => {
    it('getVendorOAuth should return OAuth config', () => {
      const samsara = VENDOR_REGISTRY['SAMSARA_ELD'];
      const oauth = getVendorOAuth(samsara);
      expect(oauth).toBeDefined();
      expect(oauth?.scopes).toEqual(['admin:read']);
    });

    it('getVendorOAuth should return undefined for non-OAuth vendor', () => {
      const project44 = VENDOR_REGISTRY['PROJECT44_TMS'];
      expect(getVendorOAuth(project44)).toBeUndefined();
    });

    it('getVendorCredentialFields should return fields', () => {
      const project44 = VENDOR_REGISTRY['PROJECT44_TMS'];
      const fields = getVendorCredentialFields(project44);
      expect(fields).toHaveLength(2);
      expect(fields[0].name).toBe('clientId');
    });

    it('getVendorOAuth should return OAuth config for QUICKBOOKS', () => {
      const qb = VENDOR_REGISTRY['QUICKBOOKS'];
      const oauth = getVendorOAuth(qb);
      expect(oauth).toBeDefined();
      expect(oauth?.scopes).toEqual(['com.intuit.quickbooks.accounting']);
    });
  });
});
