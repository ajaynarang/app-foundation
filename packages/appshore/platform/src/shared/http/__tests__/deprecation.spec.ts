import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { ApiOperation } from '@nestjs/swagger';
import { of } from 'rxjs';
import { DEPRECATION_METADATA, DeprecatedRoute, DeprecationInterceptor, deprecationHeaders } from '../deprecation';

const OPTIONS = { since: '2027-01-01T00:00:00Z', sunset: '2027-07-15T00:00:00Z', successor: '/api/v2/things' };

class Controller {
  @DeprecatedRoute(OPTIONS)
  @ApiOperation({ summary: 'List things' })
  list() {}

  @ApiOperation({ summary: 'Old thing' })
  @DeprecatedRoute({ since: OPTIONS.since, sunset: OPTIONS.sunset })
  old() {}

  plain() {}
}

function run(handler: () => void) {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (k: string, v: string) => (headers[k] = v),
    append: (k: string, v: string) => (headers[k] = v),
  };
  const context = {
    getHandler: () => handler,
    switchToHttp: () => ({ getResponse: () => res }),
  } as never;
  const result = new DeprecationInterceptor(new Reflector()).intercept(context, { handle: () => of('body') });
  return { headers, result };
}

describe('DeprecatedRoute (ADR "API contract", section 4)', () => {
  it('formats Deprecation (RFC 9745), Sunset (RFC 8594) and the successor Link', () => {
    expect(deprecationHeaders(OPTIONS)).toEqual({
      deprecation: '@1798761600',
      sunset: 'Thu, 15 Jul 2027 00:00:00 GMT',
      link: '</api/v2/things>; rel="successor-version"',
    });
  });

  it('refuses an overlap shorter than six months, and a date that does not parse', () => {
    expect(() => deprecationHeaders({ since: '2027-01-01', sunset: '2027-03-01' })).toThrow(/182 days/);
    expect(() => deprecationHeaders({ since: 'soon', sunset: '2027-03-01' })).toThrow(/"since" is not a date/);
  });

  it('writes the headers on the response and passes the body through', (done) => {
    const { headers, result } = run(Controller.prototype.list);
    expect(headers).toEqual({
      Deprecation: '@1798761600',
      Sunset: 'Thu, 15 Jul 2027 00:00:00 GMT',
      Link: '</api/v2/things>; rel="successor-version"',
    });
    result.subscribe((body) => {
      expect(body).toBe('body');
      done();
    });
  });

  it('leaves a route without the decorator alone, and omits Link without a successor', () => {
    expect(run(Controller.prototype.plain).headers).toEqual({});
    expect(run(Controller.prototype.old).headers).not.toHaveProperty('Link');
  });

  it('marks the operation deprecated in the document, whichever order the decorators run', () => {
    for (const fn of [Controller.prototype.list, Controller.prototype.old]) {
      expect(Reflect.getMetadata('swagger/apiOperation', fn)).toMatchObject({ deprecated: true });
      expect(Reflect.getMetadata(DEPRECATION_METADATA, fn)).toBeDefined();
    }
    expect(Reflect.getMetadata('swagger/apiOperation', Controller.prototype.list).summary).toBe('List things');
    expect(Reflect.getMetadata('swagger/apiOperation', Controller.prototype.old).summary).toBe('Old thing');
  });
});
