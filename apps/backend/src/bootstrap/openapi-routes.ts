import type { INestApplication } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';

/** A controller class as Nest registered it. */
export type ControllerClass = { name: string; prototype: Record<string, unknown> };

/** One documented route: its controller, handler and the operationId the builder gives it. */
export interface DocumentedRoute {
  controller: ControllerClass;
  key: string;
  handler: (...args: unknown[]) => unknown;
  /** `${Controller}_${method}` — what `buildOpenApiDocument` names the operation. */
  operationId: string;
}

const SWAGGER_EXCLUDE_CONTROLLER = 'swagger/apiExcludeController';
const SWAGGER_EXCLUDE_ENDPOINT = 'swagger/apiExcludeEndpoint';

/** The routes of the given controllers that the published document lists (no `@ApiExclude*`). */
export function documentedRoutesOf(controllers: Iterable<ControllerClass>): DocumentedRoute[] {
  const out: DocumentedRoute[] = [];
  for (const controller of controllers) {
    if (!controller?.prototype) continue;
    if (Reflect.getMetadata(SWAGGER_EXCLUDE_CONTROLLER, controller)?.[0]) continue;
    for (const key of Object.getOwnPropertyNames(controller.prototype)) {
      // Read the descriptor, never the property: a getter on the prototype would run against no instance.
      const handler = Object.getOwnPropertyDescriptor(controller.prototype, key)?.value;
      if (key === 'constructor' || typeof handler !== 'function') continue;
      if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;
      if (Reflect.getMetadata(SWAGGER_EXCLUDE_ENDPOINT, handler)?.disable) continue;
      out.push({
        controller,
        key,
        handler: handler as DocumentedRoute['handler'],
        operationId: `${controller.name}_${key}`,
      });
    }
  }
  return out;
}

/** Every documented route of the booted (or preview-mode) app. */
export function documentedRoutes(app: INestApplication): DocumentedRoute[] {
  const controllers: ControllerClass[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as ControllerClass | undefined;
      if (controller) controllers.push(controller);
    }
  }
  return documentedRoutesOf(controllers);
}

/** Sorted keys at every depth (arrays keep their order): the committed files diff only when the contract does. */
export function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortKeys) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    ) as T;
  }
  return value;
}
