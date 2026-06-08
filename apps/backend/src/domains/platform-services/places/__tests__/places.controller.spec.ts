import { Test, TestingModule } from '@nestjs/testing';
import type { PlaceSuggestion } from '@sally/shared-types';
import { PlacesController } from '../places.controller';
import { PlacesService } from '../places.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

describe('PlacesController', () => {
  let controller: PlacesController;
  let placesService: { autocomplete: jest.Mock };
  let prisma: { tenant: { findUnique: jest.Mock } };

  const mockSuggestion: PlaceSuggestion = {
    externalId: 'here:af:1',
    text: 'Walmart DC',
    provider: 'here',
  };

  beforeEach(async () => {
    placesService = { autocomplete: jest.fn().mockResolvedValue([mockSuggestion]) };
    prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 42, tenantId: 't-abc' }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlacesController],
      providers: [
        { provide: PlacesService, useValue: placesService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = module.get(PlacesController);
  });

  describe('autocomplete', () => {
    it('resolves tenant from JWT and returns wrapped results', async () => {
      const result = await controller.autocomplete({ tenantId: 't-abc' } as any, { q: 'walmart' } as any);

      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { tenantId: 't-abc' } });
      expect(placesService.autocomplete).toHaveBeenCalledWith(42, { q: 'walmart' });
      expect(result).toEqual({ results: [mockSuggestion] });
    });

    it('forwards optional query params through to the service', async () => {
      await controller.autocomplete(
        { tenantId: 't-abc' } as any,
        { q: 'walmart', country: 'US', limit: 7, sessionToken: 'sess-1' } as any,
      );

      expect(placesService.autocomplete).toHaveBeenCalledWith(42, {
        q: 'walmart',
        country: 'US',
        limit: 7,
        sessionToken: 'sess-1',
      });
    });
  });
});
