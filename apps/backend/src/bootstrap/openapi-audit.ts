import { HttpStatus, type INestApplication, RequestMethod } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  RESPONSE_PASSTHROUGH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import type { OpenAPIObject } from '@nestjs/swagger';
import { IS_PUBLIC_KEY } from '@appshore/platform/auth/decorators/public.decorator';
import { documentedRoutes } from './openapi-routes';

/**
 * Swagger completeness: what the published document must say about every route, checked against
 * the routes' own metadata (which the document alone cannot tell: is it public, does it write its own response,
 * what status does it really answer). The generator refuses to write an incomplete document, so
 * `swagger-completeness.spec.ts` (which runs it) fails the build.
 *
 * Every operation: a summary, a tag, a description on each path param, a request body (if any) with documented
 * properties. Every non-public route that returns its
 * body (no `@Res`): exactly one success response, at the status the route answers (`@HttpCode`, else Nest's
 * default), with a schema unless it is a 204.
 */

interface RouteMeta {
  operationId: string;
  status: number;
  /** `@Public()` — its response is protocol-shaped (OAuth, webhooks, health) and may stay undocumented. */
  isPublic: boolean;
  /** `@Res()` without passthrough — the handler writes the response (streams, redirects, protocols). */
  writesOwnResponse: boolean;
}

function routes(app: INestApplication): RouteMeta[] {
  return documentedRoutes(app).map(({ controller, key, handler, operationId }) => {
    const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;
    const args: Record<string, unknown> = Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, key) ?? {};
    return {
      operationId,
      status:
        Reflect.getMetadata(HTTP_CODE_METADATA, handler) ??
        (method === RequestMethod.POST ? HttpStatus.CREATED : HttpStatus.OK),
      isPublic: !!(Reflect.getMetadata(IS_PUBLIC_KEY, handler) || Reflect.getMetadata(IS_PUBLIC_KEY, controller)),
      writesOwnResponse:
        !Reflect.getMetadata(RESPONSE_PASSTHROUGH_METADATA, controller, key) &&
        Object.keys(args).some((k) => k.split(':')[0] === String(RouteParamtypes.RESPONSE)),
    };
  });
}

type Operation = {
  operationId: string;
  summary?: string;
  tags?: string[];
  parameters?: Array<{ name: string; in: string; description?: string }>;
  responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
  requestBody?: { content?: Record<string, { schema?: unknown }> };
};

/** A body schema a client can fill in: properties of its own or through `allOf`. */
function hasProperties(document: OpenAPIObject, name: string): boolean {
  const schema = document.components?.schemas?.[name] as
    | { properties?: object; allOf?: Array<{ $ref?: string; properties?: object }> }
    | undefined;
  if (!schema) return false;
  if (schema.properties && Object.keys(schema.properties).length > 0) return true;
  return (schema.allOf ?? []).some(
    (part) =>
      (part.properties && Object.keys(part.properties).length > 0) ||
      (part.$ref && hasProperties(document, part.$ref.split('/').pop())),
  );
}

/** Every completeness violation, one line each (`Controller_method: …`); empty when the document is complete. */
export function auditOpenApiDocument(app: INestApplication, document: OpenAPIObject): string[] {
  const ops = new Map<string, { path: string; op: Operation }>();
  const problems: string[] = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, op] of Object.entries(item as Record<string, Operation>)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      if (ops.has(op.operationId)) problems.push(`${op.operationId}: operationId is not unique`);
      ops.set(op.operationId, { path, op });
    }
  }

  for (const route of routes(app)) {
    const found = ops.get(route.operationId);
    if (!found) {
      problems.push(`${route.operationId}: not in the document`);
      continue;
    }
    const { path, op } = found;
    const id = `${route.operationId} (${path})`;
    if (!op.summary?.trim()) problems.push(`${id}: no @ApiOperation summary`);
    if (!op.tags?.length) problems.push(`${id}: no @ApiTags`);
    for (const [, name] of path.matchAll(/\{([^}]+)\}/g)) {
      const param = op.parameters?.find((p) => p.in === 'path' && p.name === name);
      if (!param) problems.push(`${id}: path param {${name}} is not declared`);
      else if (!param.description?.trim()) problems.push(`${id}: path param {${name}} has no @ApiParam description`);
    }
    const body = op.requestBody?.content?.['application/json']?.schema as { $ref?: string } | undefined;
    const bodyName = body?.$ref?.split('/').pop();
    if (bodyName && !hasProperties(document, bodyName)) {
      problems.push(`${id}: request body ${bodyName} documents no properties (@ApiProperty on each field)`);
    }
    if (route.isPublic || route.writesOwnResponse) continue;

    const success = Object.keys(op.responses ?? {}).filter((s) => /^2\d\d$/.test(s));
    if (success.length !== 1 || success[0] !== String(route.status)) {
      problems.push(
        `${id}: documents ${success.join(', ') || 'no'} success response(s); the route answers ${route.status}`,
      );
      continue;
    }
    const schema = op.responses?.[success[0]]?.content?.['application/json']?.schema;
    if (route.status !== Number(HttpStatus.NO_CONTENT) && !schema) {
      problems.push(`${id}: the ${route.status} response has no schema (@ApiResult)`);
    }
  }
  return problems.sort();
}
