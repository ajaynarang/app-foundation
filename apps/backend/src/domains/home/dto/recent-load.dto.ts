import { ApiProperty } from '@nestjs/swagger';

export class RecentLoadDto {
  @ApiProperty({ example: 'LD-20260411-001' })
  id: string;

  @ApiProperty({ example: 'LD-20260411-001' })
  loadNumber: string;

  @ApiProperty({ example: 'PO-12345', nullable: true })
  referenceNumber: string | null;

  @ApiProperty({ example: 'Chicago', nullable: true })
  originCity: string | null;

  @ApiProperty({ example: 'IL', nullable: true })
  originState: string | null;

  @ApiProperty({ example: 'Dallas', nullable: true })
  destinationCity: string | null;

  @ApiProperty({ example: 'TX', nullable: true })
  destinationState: string | null;

  @ApiProperty({ example: 'IN_TRANSIT' })
  status: string;

  @ApiProperty({ example: 'John Doe', nullable: true })
  driverName: string | null;

  @ApiProperty({
    description: 'ISO 8601 timestamp',
    example: '2026-04-11T14:30:00.000Z',
  })
  updatedAt: string;
}
