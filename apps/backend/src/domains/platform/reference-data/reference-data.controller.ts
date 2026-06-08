import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { ReferenceDataService } from './reference-data.service';
import { QueryReferenceDataDto } from './dto/query-reference-data.dto';

@ApiTags('Reference Data')
@Controller('reference-data')
export class ReferenceDataController {
  constructor(private readonly referenceDataService: ReferenceDataService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get reference data by category' })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Comma-separated categories (e.g. equipment_type,vehicle_status)',
  })
  async getReferenceData(@Query() query: QueryReferenceDataDto) {
    const categories = query.category ? query.category.split(',').map((c) => c.trim()) : undefined;
    return this.referenceDataService.getByCategories(categories);
  }
}
