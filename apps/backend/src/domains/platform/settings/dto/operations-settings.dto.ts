import {
  IsOptional,
  IsNumber,
  IsInt,
  IsBoolean,
  IsString,
  IsArray,
  IsIn,
  Min,
  Max,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';

export class UpdateOperationsSettingsDto {
  // Optimization Defaults
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPerMile?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  laborCostPerHour?: number;

  // Rest Insertion Preferences
  @IsOptional()
  @IsBoolean()
  preferFullRest?: boolean;

  @IsOptional()
  @IsBoolean()
  allowDockRest?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  maxFuelDetour?: number;

  @IsOptional()
  @IsNumber()
  @Min(1.0)
  @Max(10.0)
  estimatedDieselPricePerGallon?: number;

  @IsOptional()
  @IsNumber()
  @Min(8)
  @Max(30)
  splitSleeperThresholdHours?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  fuelCards?: string[];

  // Shield
  @IsOptional()
  @IsBoolean()
  shieldAiEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  shieldCustomRulesEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  shieldAuditPeriodDays?: number;

  // Alert Settings
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(48)
  alertResolveCooldownHours?: number;

  // Lane Generation
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(14)
  laneGenerationLookaheadDays?: number;

  // Document Compliance Settings
  @IsOptional()
  @IsString()
  @IsIn(['required', 'recommended', 'when_applicable', 'not_required'])
  bolEnforcement?: string;

  @IsOptional()
  @IsString()
  @IsIn(['required', 'recommended', 'when_applicable', 'not_required'])
  podEnforcement?: string;

  @IsOptional()
  @IsString()
  @IsIn(['required', 'recommended', 'when_applicable', 'not_required'])
  rateConEnforcement?: string;

  @IsOptional()
  @IsString()
  @IsIn(['required', 'recommended', 'when_applicable', 'not_required'])
  lumperReceiptEnforcement?: string;

  @IsOptional()
  @IsString()
  @IsIn(['required', 'recommended', 'when_applicable', 'not_required'])
  scaleTicketEnforcement?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  podGracePeriodHours?: number;

  @IsOptional()
  @IsBoolean()
  requireBillableCharge?: boolean;

  @IsOptional()
  @IsBoolean()
  allowBillingOverride?: boolean;
}
