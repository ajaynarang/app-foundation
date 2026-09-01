import { BadRequestException } from '@nestjs/common';
import { isTestMarker, assertNoTestMarker } from '../test-marker.util';

describe('isTestMarker', () => {
  it('flags the multiword dev markers as substrings, case-insensitively', () => {
    expect(isTestMarker('SSE live test (delete me)')).toBe(true);
    expect(isTestMarker('Please DELETE ME')).toBe(true);
    expect(isTestMarker('sse live TEST at 5pm')).toBe(true);
  });

  it('flags a lone marker word that is the whole trimmed value', () => {
    expect(isTestMarker('test')).toBe(true);
    expect(isTestMarker('  asdf  ')).toBe(true);
    expect(isTestMarker('Hello')).toBe(true);
  });

  it('does NOT flag a real sentence that merely contains a marker word', () => {
    expect(isTestMarker('COVID test at the gate')).toBe(false);
    expect(isTestMarker('Say hello to the finalists')).toBe(false);
    expect(isTestMarker('Finals moved to Court 2')).toBe(false);
  });

  it('treats empty / null / undefined as not a marker', () => {
    expect(isTestMarker('')).toBe(false);
    expect(isTestMarker(null)).toBe(false);
    expect(isTestMarker(undefined)).toBe(false);
  });
});

describe('assertNoTestMarker', () => {
  it('throws a BadRequest for a marker', () => {
    expect(() => assertNoTestMarker('delete me')).toThrow(BadRequestException);
  });

  it('is a no-op for clean copy', () => {
    expect(() => assertNoTestMarker('Finals at 4pm')).not.toThrow();
  });
});
