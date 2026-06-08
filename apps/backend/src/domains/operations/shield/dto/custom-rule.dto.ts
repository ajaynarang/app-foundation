import {
  IsString,
  IsBoolean,
  IsOptional,
  MaxLength,
  MinLength,
  Matches,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

/**
 * Reject rules that contain prompt-injection patterns or are clearly
 * not fleet compliance rules. This is defense-in-depth — the AI prompt
 * also instructs the model to skip nonsensical rules.
 */
@ValidatorConstraint({ name: 'noInjectionPatterns', async: false })
class NoInjectionPatternsConstraint implements ValidatorConstraintInterface {
  private static readonly BLOCKED_PATTERNS = [
    /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
    /you\s+are\s+now\s+a/i,
    /forget\s+(everything|all|your)\s+(you|instructions?|rules?)/i,
    /system\s*:\s*/i,
    /\bdo\s+not\s+follow\b/i,
    /\boverride\b.*\binstructions?\b/i,
    /\bnew\s+instructions?\b/i,
    /\breturn\b.*\bjson\b/i,
    /\boutput\b.*\bonly\b/i,
    /<\/?(?:script|img|iframe|svg|object|embed)\b/i,
  ];

  validate(text: string): boolean {
    return !NoInjectionPatternsConstraint.BLOCKED_PATTERNS.some((p) => p.test(text));
  }

  defaultMessage(): string {
    return 'Rule contains disallowed content. Rules must describe fleet compliance requirements.';
  }
}

/** Strip control characters and collapse whitespace before validation. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/g;

function sanitizeRule(value: unknown): string {
  if (typeof value !== 'string') return value as string;
  return value
    .replace(CONTROL_CHARS_RE, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

export class CreateCustomRuleDto {
  @ApiProperty({
    description: 'Natural language fleet compliance rule',
    minLength: 10,
    maxLength: 500,
    example: 'All drivers must have a valid medical card on file',
  })
  @Transform(({ value }) => sanitizeRule(value))
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  @Matches(/[a-zA-Z]/, {
    message: 'Rule must contain readable text describing a compliance requirement.',
  })
  @Validate(NoInjectionPatternsConstraint)
  rule: string;
}

export class UpdateCustomRuleDto {
  @ApiProperty({ description: 'Updated rule text', required: false })
  @IsOptional()
  @Transform(({ value }) => sanitizeRule(value))
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  @Matches(/[a-zA-Z]/, {
    message: 'Rule must contain readable text describing a compliance requirement.',
  })
  @Validate(NoInjectionPatternsConstraint)
  rule?: string;

  @ApiProperty({ description: 'Whether the rule is active', required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
