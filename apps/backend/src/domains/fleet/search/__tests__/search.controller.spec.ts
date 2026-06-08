import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SearchController } from '../search.controller';
import { SearchService } from '../search.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

describe('SearchController', () => {
  let controller: SearchController;
  let searchService: { search: jest.Mock };
  let prisma: { tenant: { findUnique: jest.Mock } };

  beforeEach(async () => {
    searchService = { search: jest.fn() };
    prisma = { tenant: { findUnique: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: SearchService, useValue: searchService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = module.get<SearchController>(SearchController);
  });

  it('should search with default limit', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 1 });
    searchService.search.mockResolvedValue({ loads: [], drivers: [] });

    await controller.search({ tenantId: 'TNT-001' }, 'test query');

    expect(searchService.search).toHaveBeenCalledWith(1, 'test query', 10);
  });

  it('should search with custom limit', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 1 });
    searchService.search.mockResolvedValue({ loads: [] });

    await controller.search({ tenantId: 'TNT-001' }, 'query', '25');

    expect(searchService.search).toHaveBeenCalledWith(1, 'query', 25);
  });

  it('should cap limit at 50', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 1 });
    searchService.search.mockResolvedValue({ loads: [] });

    await controller.search({ tenantId: 'TNT-001' }, 'query', '100');

    expect(searchService.search).toHaveBeenCalledWith(1, 'query', 50);
  });

  it('should throw NotFoundException when tenant not found', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(controller.search({ tenantId: 'INVALID' }, 'query')).rejects.toThrow(NotFoundException);
  });
});
