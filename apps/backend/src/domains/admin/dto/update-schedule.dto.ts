import {
  IsOptional,
  IsString,
  IsInt,
  IsBoolean,
  Min,
  Max,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { CronExpressionParser } from 'cron-parser';

@ValidatorConstraint({ name: 'isCronExpression', async: false })
class IsCronExpression implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    try {
      CronExpressionParser.parse(value);
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    return `"${args.value}" is not a valid cron expression`;
  }
}

export class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  @Validate(IsCronExpression)
  pattern?: string;

  @IsOptional()
  @IsInt()
  @Min(10000, { message: 'Minimum interval is 10 seconds' })
  @Max(86400000, { message: 'Maximum interval is 24 hours' })
  intervalMs?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
