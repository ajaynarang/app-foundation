import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AutocompleteQueryDto } from '../dto/autocomplete-query.dto';

function build(raw: Record<string, unknown>): { dto: AutocompleteQueryDto; errors: string[] } {
  const dto = plainToInstance(AutocompleteQueryDto, raw);
  const errors = validateSync(dto).map((e) => Object.values(e.constraints ?? {}).join(', '));
  return { dto, errors };
}

describe('AutocompleteQueryDto', () => {
  it('accepts a minimal valid query', () => {
    const { dto, errors } = build({ q: 'walmart' });
    expect(errors).toEqual([]);
    expect(dto.q).toBe('walmart');
  });

  it('trims whitespace on q', () => {
    const { dto, errors } = build({ q: '  walmart  ' });
    expect(errors).toEqual([]);
    expect(dto.q).toBe('walmart');
  });

  it('passes q through untouched if not a string (validator catches it)', () => {
    const { errors } = build({ q: 123 });
    expect(errors.join('|')).toMatch(/string/i);
  });

  it('rejects non-US country', () => {
    const { errors } = build({ q: 'walmart', country: 'CA' });
    expect(errors.join('|')).toMatch(/US/);
  });

  it('accepts country=US', () => {
    const { dto, errors } = build({ q: 'walmart', country: 'US' });
    expect(errors).toEqual([]);
    expect(dto.country).toBe('US');
  });

  it('coerces limit string to number and rejects > 10', () => {
    const { errors } = build({ q: 'walmart', limit: '15' });
    expect(errors.join('|')).toMatch(/not.*greater than 10/);
  });

  it('coerces limit string to number and accepts in-range', () => {
    const { dto, errors } = build({ q: 'walmart', limit: '5' });
    expect(errors).toEqual([]);
    expect(dto.limit).toBe(5);
  });

  it('rejects limit < 1', () => {
    const { errors } = build({ q: 'walmart', limit: 0 });
    expect(errors.join('|')).toMatch(/not.*less than 1/);
  });

  it('rejects non-integer limit', () => {
    const { errors } = build({ q: 'walmart', limit: 3.5 });
    expect(errors.join('|')).toMatch(/integer/i);
  });

  it('accepts a session token', () => {
    const { dto, errors } = build({ q: 'walmart', sessionToken: 'abc-1' });
    expect(errors).toEqual([]);
    expect(dto.sessionToken).toBe('abc-1');
  });

  it('rejects a non-string session token', () => {
    const { errors } = build({ q: 'walmart', sessionToken: 123 });
    expect(errors.join('|')).toMatch(/string/i);
  });
});
