import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTicketDto {
  @ApiPropertyOptional({
    enum: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'],
  })
  @IsOptional()
  @IsEnum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'] as const)
  status?: string;

  @ApiPropertyOptional({ enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] })
  @IsOptional()
  @IsEnum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const)
  priority?: string;

  @ApiPropertyOptional({
    enum: ['BILLING', 'TECHNICAL', 'FEATURE_REQUEST', 'ACCOUNT', 'INTEGRATION', 'GENERAL'],
  })
  @IsOptional()
  @IsEnum(['BILLING', 'TECHNICAL', 'FEATURE_REQUEST', 'ACCOUNT', 'INTEGRATION', 'GENERAL'] as const)
  category?: string;
}
