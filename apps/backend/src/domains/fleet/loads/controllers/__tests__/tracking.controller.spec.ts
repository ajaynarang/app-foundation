import { Test, TestingModule } from '@nestjs/testing';
import { TrackingController } from '../tracking.controller';
import { LoadsService } from '../../services/loads.service';

describe('TrackingController', () => {
  let controller: TrackingController;

  const mockLoadsService = {
    getPublicTracking: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrackingController],
      providers: [{ provide: LoadsService, useValue: mockLoadsService }],
    }).compile();

    controller = module.get<TrackingController>(TrackingController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getTrackingInfo', () => {
    it('returns public tracking info for a valid token', async () => {
      const trackingData = {
        loadNumber: 'LD-001',
        status: 'IN_TRANSIT',
        carrier: 'ACME',
        timeline: [],
      };
      mockLoadsService.getPublicTracking.mockResolvedValue(trackingData);

      const result = await controller.getTrackingInfo('abc123token');

      expect(mockLoadsService.getPublicTracking).toHaveBeenCalledWith('abc123token');
      expect(result).toEqual(trackingData);
    });

    it('passes through NotFoundException from service', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockLoadsService.getPublicTracking.mockRejectedValue(new NotFoundException('Tracking information not found'));

      await expect(controller.getTrackingInfo('bad-token')).rejects.toThrow(NotFoundException);
    });

    it('handles different token formats', async () => {
      mockLoadsService.getPublicTracking.mockResolvedValue({
        status: 'DELIVERED',
      });

      await controller.getTrackingInfo('a-very-long-uuid-style-token-12345');

      expect(mockLoadsService.getPublicTracking).toHaveBeenCalledWith('a-very-long-uuid-style-token-12345');
    });
  });
});
