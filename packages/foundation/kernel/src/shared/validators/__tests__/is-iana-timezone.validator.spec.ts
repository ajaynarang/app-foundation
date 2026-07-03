import { validate } from 'class-validator';

import { isIanaTimezone, IsIanaTimezone } from '../is-iana-timezone.validator';

describe('isIanaTimezone', () => {
  it('accepts a valid region timezone', () => {
    expect(isIanaTimezone('America/Chicago')).toBe(true);
  });

  it('accepts UTC', () => {
    expect(isIanaTimezone('UTC')).toBe(true);
  });

  it('rejects a made-up zone', () => {
    expect(isIanaTimezone('Mars/Olympus')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isIanaTimezone('')).toBe(false);
  });

  it('rejects a non-string value', () => {
    expect(isIanaTimezone(undefined as unknown as string)).toBe(false);
    expect(isIanaTimezone(42 as unknown as string)).toBe(false);
  });
});

describe('IsIanaTimezone decorator', () => {
  class Dto {
    @IsIanaTimezone()
    timezone!: string;
  }

  it('passes validation for a valid IANA id', async () => {
    const dto = new Dto();
    dto.timezone = 'America/Los_Angeles';
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails validation for an invalid IANA id', async () => {
    const dto = new Dto();
    dto.timezone = 'Not/AZone';
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.isIanaTimezone).toContain('valid IANA timezone');
  });
});
