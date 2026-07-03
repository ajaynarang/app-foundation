import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateUserPreferencesDto } from '../user-preferences.dto';

describe('UpdateUserPreferencesDto.timezone', () => {
  it('accepts a valid IANA timezone', async () => {
    const dto = plainToInstance(UpdateUserPreferencesDto, { timezone: 'America/Chicago' });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'timezone')).toBeUndefined();
  });

  it('rejects an invalid timezone string', async () => {
    const dto = plainToInstance(UpdateUserPreferencesDto, { timezone: 'Mars/Phobos' });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'timezone')).toBeDefined();
  });

  it('allows omitting timezone (optional)', async () => {
    const dto = plainToInstance(UpdateUserPreferencesDto, {});
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'timezone')).toBeUndefined();
  });
});
