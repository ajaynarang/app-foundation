import {
  IsOptional,
  IsString,
  IsIn,
  IsObject,
  MaxLength,
  ValidateIf,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Custom validator: at least one of `content` or `promptKey` must be provided
 * as a non-empty string.
 */
function HasContentOrPromptKey(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'hasContentOrPromptKey',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const dto = args.object as SendMessageDto;
          const content = typeof dto.content === 'string' ? dto.content.trim() : '';
          const key = typeof dto.promptKey === 'string' ? dto.promptKey.trim() : '';
          return content.length > 0 || key.length > 0;
        },
        defaultMessage() {
          return 'Either content or promptKey must be provided and non-empty';
        },
      },
    });
  };
}

export class SendMessageDto {
  @ValidateIf((o) => !o.promptKey)
  @IsString()
  @MaxLength(4000)
  content: string;

  @IsString()
  @IsIn(['text', 'voice'])
  inputMode: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  promptKey?: string;

  @IsOptional()
  @IsObject()
  promptVariables?: Record<string, string>;

  // Cross-field validator: ensures at least one of content / promptKey is set.
  @HasContentOrPromptKey()
  private readonly __contentOrPromptKey?: unknown;
}
