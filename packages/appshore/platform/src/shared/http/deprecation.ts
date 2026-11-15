import {
  applyDecorators,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * Versioning (ADR "API contract", section 4). One URI major (`/api/v1`); additive changes ship in v1. A breaking
 * change ships as v2 BESIDE v1, and the v1 route is marked with {@link DeprecatedRoute}: every response then carries
 *
 * - `Deprecation: @<unix seconds>` (RFC 9745): since when,
 * - `Sunset: <HTTP-date>` (RFC 8594): when v1 stops answering (at least six months after `since`),
 * - `Link: <successor>; rel="successor-version"`: the v2 route, when given,
 *
 * and the published OpenAPI document marks the operation `deprecated: true`. CORS exposes the three headers
 * (`main.ts`). No route is deprecated yet.
 */

export interface DeprecationOptions {
  /** When the route was deprecated (the day its successor shipped). */
  since: Date | string;
  /** When it stops answering: at least {@link MIN_SUNSET_DAYS} after `since`. */
  sunset: Date | string;
  /** The successor route's URL or path (`/api/v2/things`). */
  successor?: string;
}

/** At least six months of overlap between a v2 shipping and its v1 going away. */
export const MIN_SUNSET_DAYS = 182;

export const DEPRECATION_METADATA = 'appshore:deprecation';

/** The headers a deprecated route writes; `main.ts` exposes them to browser clients through CORS. */
export const DEPRECATION_HEADERS = ['Deprecation', 'Sunset', 'Link'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

interface ResolvedDeprecation {
  deprecation: string;
  sunset: string;
  link?: string;
}

function toDate(value: Date | string, field: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`@DeprecatedRoute: "${field}" is not a date`);
  return date;
}

/** The three headers for a deprecation. Throws (at boot) when the overlap is shorter than six months. */
export function deprecationHeaders(options: DeprecationOptions): ResolvedDeprecation {
  const since = toDate(options.since, 'since');
  const sunset = toDate(options.sunset, 'sunset');
  if (sunset.getTime() - since.getTime() < MIN_SUNSET_DAYS * DAY_MS) {
    throw new Error(`@DeprecatedRoute: sunset must be at least ${MIN_SUNSET_DAYS} days after since`);
  }
  return {
    deprecation: `@${Math.floor(since.getTime() / 1000)}`,
    sunset: sunset.toUTCString(),
    ...(options.successor ? { link: `<${options.successor}>; rel="successor-version"` } : {}),
  };
}

/**
 * Writes the deprecation headers on a {@link DeprecatedRoute}'s responses: success, and errors from the handler or
 * pipes. A guard's 401/403 runs before interceptors and carries no `Deprecation` (the caller is told once it is in).
 */
@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const headers = this.reflector.get<ResolvedDeprecation | undefined>(DEPRECATION_METADATA, context.getHandler());
    if (headers) {
      const res = context.switchToHttp().getResponse<Response>();
      res.setHeader('Deprecation', headers.deprecation);
      res.setHeader('Sunset', headers.sunset);
      if (headers.link) res.append('Link', headers.link);
    }
    return next.handle();
  }
}

/** Mark the operation deprecated in the document, keeping whatever `@ApiOperation` says (either order). */
function markDeprecatedInDocument(): MethodDecorator {
  return (_target, _key, descriptor: PropertyDescriptor) => {
    const previous = Reflect.getMetadata('swagger/apiOperation', descriptor.value) ?? {};
    Reflect.defineMetadata('swagger/apiOperation', { ...previous, deprecated: true }, descriptor.value);
    return descriptor;
  };
}

/** Deprecate a v1 route once its v2 successor ships. */
export function DeprecatedRoute(options: DeprecationOptions) {
  return applyDecorators(
    SetMetadata(DEPRECATION_METADATA, deprecationHeaders(options)),
    UseInterceptors(DeprecationInterceptor),
    markDeprecatedInDocument(),
  );
}
