import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../../../auth/decorators/public.decorator';
import { LoadsService } from '../services/loads.service';

@ApiTags('Tracking')
@Controller('tracking')
export class TrackingController {
  constructor(private readonly loadsService: LoadsService) {}

  @Get(':token')
  @Public()
  @ApiOperation({
    summary: 'Get public tracking info for a load (no auth required)',
  })
  async getTrackingInfo(@Param('token') token: string) {
    return this.loadsService.getPublicTracking(token);
  }
}
