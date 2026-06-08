import { ApiProperty } from '@nestjs/swagger';

export class HomePulseDto {
  @ApiProperty({
    description: 'Count of operationally active loads',
    example: 12,
  })
  activeLoads: number;

  @ApiProperty({ description: 'Count of active alerts', example: 3 })
  alertCount: number;

  @ApiProperty({
    description: 'Count of desk episodes pending human review',
    example: 2,
  })
  pendingDecisions: number;

  @ApiProperty({
    description: 'Sum of rate_cents for delivered loads without an invoice',
    example: 450000,
  })
  unbilledCents: number;
}
