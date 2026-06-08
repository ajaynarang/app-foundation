import { IsEnum, IsOptional, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TriggerAuditDto {
  @ApiProperty({
    enum: ['FULL', 'HOS', 'DRIVERS', 'VEHICLES', 'LOADS'],
    default: 'FULL',
    description: 'Scope of the audit to run',
  })
  @IsEnum(['FULL', 'HOS', 'DRIVERS', 'VEHICLES', 'LOADS'] as const)
  @IsOptional()
  scope?: 'FULL' | 'HOS' | 'DRIVERS' | 'VEHICLES' | 'LOADS' = 'FULL';

  @ApiProperty({ description: 'Include AI analysis', default: true })
  @IsOptional()
  @IsBoolean()
  includeAi?: boolean;

  @ApiProperty({
    description: 'Include custom rules in AI analysis',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeCustomRules?: boolean;

  @ApiProperty({
    description: 'Historical audit period in days (active loads always included)',
    default: 30,
    minimum: 7,
    maximum: 180,
  })
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(180)
  auditPeriodDays?: number;
}
