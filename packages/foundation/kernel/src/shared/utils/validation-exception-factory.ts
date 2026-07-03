import { BadRequestException, ValidationError } from '@nestjs/common';

/**
 * Transforms class-validator ValidationErrors into user-friendly messages.
 *
 * Returns both a human-readable `detail` and structured `fieldErrors`
 * so the frontend can show inline field-level messages when ready.
 */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const fieldErrors: Record<string, string> = {};

  for (const error of flattenErrors(errors)) {
    if (error.property && error.constraints) {
      // Take first constraint message (most specific)
      const messages = Object.values(error.constraints);
      fieldErrors[error.property] = messages[0];
    }
  }

  const fieldCount = Object.keys(fieldErrors).length;
  const detail =
    fieldCount === 1
      ? Object.values(fieldErrors)[0]
      : `${fieldCount} fields have validation errors. Please check your input.`;

  return new BadRequestException({
    detail,
    fieldErrors,
  });
}

/**
 * Recursively flattens nested ValidationErrors (from @ValidateNested).
 */
function flattenErrors(errors: ValidationError[], prefix = ''): ValidationError[] {
  const result: ValidationError[] = [];
  for (const error of errors) {
    const property = prefix ? `${prefix}.${error.property}` : error.property;
    if (error.constraints) {
      result.push({ ...error, property });
    }
    if (error.children?.length) {
      result.push(...flattenErrors(error.children, property));
    }
  }
  return result;
}
