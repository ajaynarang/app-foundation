import { readFileSync } from 'fs';
import { join } from 'path';
import type { INestApplication } from '@nestjs/common';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { mountSwaggerUi, swaggerUiEnabled } from '../swagger-ui';

describe('Swagger UI', () => {
  const app = {} as INestApplication;
  const document = { openapi: '3.0.0' } as OpenAPIObject;
  let setup: jest.SpyInstance;

  beforeEach(() => {
    setup = jest.spyOn(SwaggerModule, 'setup').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is off in production', () => {
    expect(swaggerUiEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(mountSwaggerUi(app, document, { NODE_ENV: 'production' })).toBe(false);
    expect(setup).not.toHaveBeenCalled();
  });

  it.each([[''], ['1'], ['yes'], ['TRUE ']])('stays off in production unless explicitly "true" (%j)', (value) => {
    const env = { NODE_ENV: 'production', SWAGGER_UI_ENABLED: value };
    expect(swaggerUiEnabled(env)).toBe(value.trim().toLowerCase() === 'true');
  });

  it('can be turned on in production deliberately', () => {
    expect(mountSwaggerUi(app, document, { NODE_ENV: 'production', SWAGGER_UI_ENABLED: 'true' })).toBe(true);
    expect(setup).toHaveBeenCalledWith('api', app, document);
  });

  it.each([['development'], ['test'], [undefined]])('is on outside production (NODE_ENV=%s)', (nodeEnv) => {
    expect(mountSwaggerUi(app, document, { NODE_ENV: nodeEnv })).toBe(true);
    expect(setup).toHaveBeenCalledWith('api', app, document);
  });

  it('can be turned off outside production', () => {
    expect(mountSwaggerUi(app, document, { NODE_ENV: 'development', SWAGGER_UI_ENABLED: 'false' })).toBe(false);
    expect(setup).not.toHaveBeenCalled();
  });

  it('main.ts mounts the UI only through this gate', () => {
    const main = readFileSync(join(__dirname, '../../main.ts'), 'utf8');
    expect(main).toMatch(/mountSwaggerUi\(app, document\)/);
    expect(main).not.toMatch(/SwaggerModule\.setup\(/);
  });
});
