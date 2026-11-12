import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidatorOptions } from 'class-validator';
import { validationExceptionFactory } from './validation-exception-factory';
import { propertySpelledParams } from './query-dto';
import { fieldErrors } from '../errors/api-errors';

/**
 * A DTO for a body whose wire shape an external standard defines (e.g. RFC 7591 client registration), where the
 * standard — not this API — names the fields and the error codes.
 */
export interface ProtocolWireOptions {
  /**
   * Drop fields the DTO does not declare instead of rejecting them. For standards that require the server to
   * ignore metadata it does not understand (RFC 7591 §2). Undeclared fields never reach the handler either way.
   */
  ignoreUnknownFields?: boolean;
  /** The standard's machine error code, added to the 400 as `error` (+ `error_description`). Gets the bad fields. */
  errorCode?: string | ((fields: string[]) => string);
}

const PROTOCOL_WIRE = Symbol('protocolWireDto');

/** Marks a DTO class as a protocol wire shape — see {@link ProtocolWireOptions}. */
export function ProtocolWireDto(options: ProtocolWireOptions): ClassDecorator {
  return (target) => {
    Reflect.defineProperty(target, PROTOCOL_WIRE, { value: options });
  };
}

export function protocolWireOptionsOf(metatype: unknown): ProtocolWireOptions | undefined {
  return metatype ? (metatype as Record<symbol, ProtocolWireOptions | undefined>)[PROTOCOL_WIRE] : undefined;
}

/**
 * The app's global validation pipe: strict class-validator DTOs (whitelist + forbid unknown fields, the
 * `{ detail, fieldErrors }` 400), with the {@link ProtocolWireDto} exceptions for standard wire formats.
 */
export class AppValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    });
  }

  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    const wire = protocolWireOptionsOf(metadata.metatype);
    // A protocol shape that ignores unknown fields ignores these too.
    const misspelled = wire?.ignoreUnknownFields ? [] : propertySpelledParams(metadata.metatype, value);
    if (misspelled.length) {
      throw fieldErrors(Object.fromEntries(misspelled.map((key) => [key, `property ${key} should not exist`])));
    }
    try {
      return await super.transform(value, metadata);
    } catch (error) {
      if (!wire?.errorCode || !(error instanceof BadRequestException)) throw error;
      const body = error.getResponse() as { detail?: string; fieldErrors?: Record<string, string> };
      const fields = Object.keys(body.fieldErrors ?? {});
      const code = typeof wire.errorCode === 'function' ? wire.errorCode(fields) : wire.errorCode;
      throw new BadRequestException({ ...body, error: code, error_description: body.detail });
    }
  }

  protected validate(object: object, validatorOptions?: ValidatorOptions) {
    const wire = protocolWireOptionsOf(object.constructor);
    return super.validate(
      object,
      wire?.ignoreUnknownFields ? { ...validatorOptions, forbidNonWhitelisted: false } : validatorOptions,
    );
  }
}
