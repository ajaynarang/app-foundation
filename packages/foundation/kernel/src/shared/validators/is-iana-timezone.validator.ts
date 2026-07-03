import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Returns true when `tz` is a valid IANA timezone identifier (e.g.
 * "America/Chicago", "UTC"). Probes the platform's Intl database — the same
 * source the runtime uses to convert times — so we accept exactly what the
 * scheduler can actually resolve. Invalid or non-string values return false.
 */
export function isIanaTimezone(tz: string): boolean {
  if (typeof tz !== 'string' || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * class-validator decorator wrapping {@link isIanaTimezone}. Use on optional
 * timezone fields together with `@IsOptional()`.
 */
export function IsIanaTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIanaTimezone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isIanaTimezone(value as string);
        },
        defaultMessage() {
          return `${propertyName} must be a valid IANA timezone identifier`;
        },
      },
    });
  };
}
