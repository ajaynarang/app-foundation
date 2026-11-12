import { BadRequestException, ConflictException } from '@nestjs/common';
import { z } from 'zod';
import {
  duplicate,
  fieldError,
  fieldErrors,
  invalidState,
  isZodError,
  parseWithSchema,
  stale,
  stateLabel,
  zodFieldErrors,
} from './api-errors';

const bodyOf = (e: { getResponse(): unknown }) => e.getResponse() as Record<string, unknown>;

describe('api-errors', () => {
  it('fieldError is a 400 VALIDATION_FAILED naming the field', () => {
    const e = fieldError('sort', 'Unknown sort option');
    expect(e).toBeInstanceOf(BadRequestException);
    expect(e.message).toBe('Unknown sort option');
    expect(bodyOf(e)).toMatchObject({
      code: 'VALIDATION_FAILED',
      detail: 'Unknown sort option',
      fieldErrors: { sort: 'Unknown sort option' },
    });
  });

  it('fieldErrors summarises several fields unless given a detail', () => {
    expect(bodyOf(fieldErrors({ a: 'A bad', b: 'B bad' })).detail).toBe('2 fields are missing or invalid');
    expect(bodyOf(fieldErrors({ a: 'A bad' })).detail).toBe('A bad');
    expect(bodyOf(fieldErrors({ a: 'A bad' }, 'Fix it')).detail).toBe('Fix it');
  });

  it.each([
    [invalidState, 'INVALID_STATE'],
    [stale, 'STALE'],
    [duplicate, 'DUPLICATE'],
  ])('%p is a 409 with its code', (make, code) => {
    const e = make('Nope');
    expect(e).toBeInstanceOf(ConflictException);
    expect(e.getStatus()).toBe(409);
    expect(bodyOf(e)).toMatchObject({ code, detail: 'Nope' });
  });

  it('zodFieldErrors keys by dot path, first message wins, root issues land on _root', () => {
    expect(
      zodFieldErrors([
        { path: ['items', 0, 'title'], message: 'Required' },
        { path: ['items', 0, 'title'], message: 'Second' },
        { path: [], message: 'Bad object' },
      ]),
    ).toEqual({ 'items.0.title': 'Required', _root: 'Bad object' });
  });

  it('isZodError recognises a ZodError and nothing else', () => {
    const result = z.object({ a: z.string() }).safeParse({});
    expect(isZodError(!result.success && result.error)).toBe(true);
    expect(isZodError(new Error('x'))).toBe(false);
    expect(isZodError('ZodError')).toBe(false);
  });

  it('parseWithSchema returns data or throws 400 with fieldErrors', () => {
    const schema = z.object({ limit: z.coerce.number().int().max(100) });
    expect(parseWithSchema(schema, { limit: '5' })).toEqual({ limit: 5 });
    try {
      parseWithSchema(schema, { limit: '500' });
      fail('expected a throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect(bodyOf(e as BadRequestException)).toMatchObject({
        code: 'VALIDATION_FAILED',
        fieldErrors: { limit: expect.any(String) },
      });
    }
  });
});

describe('stateLabel', () => {
  it('reads an enum state as copy', () => {
    expect(stateLabel('PENDING_REVIEW')).toBe('pending review');
    expect(stateLabel('ACTIVE')).toBe('active');
  });
});
