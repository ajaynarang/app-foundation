import { BadRequestException } from '@nestjs/common';
import { IsArray, IsString, MaxLength } from 'class-validator';
import { AppValidationPipe, ProtocolWireDto } from '../app-validation-pipe';

class StrictDto {
  @IsString()
  name!: string;
}

@ProtocolWireDto({
  ignoreUnknownFields: true,
  errorCode: (f) => (f.includes('uris') ? 'invalid_redirect_uri' : 'invalid_meta'),
})
class WireDto {
  @IsString()
  @MaxLength(5)
  client_name!: string;

  @IsArray()
  @IsString({ each: true })
  uris!: string[];
}

@ProtocolWireDto({ errorCode: 'fixed_code' })
class FixedCodeDto {
  @IsString()
  name!: string;
}

const body = (metatype: unknown) => ({ type: 'body' as const, metatype: metatype as never });

async function rejection(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return (e as BadRequestException).getResponse() as Record<string, unknown>;
  }
  throw new Error('expected a 400');
}

describe('AppValidationPipe', () => {
  const pipe = new AppValidationPipe();

  it('rejects unknown fields on an ordinary DTO with the {detail, fieldErrors} 400', async () => {
    const res = await rejection(pipe.transform({ name: 'a', extra: 1 }, body(StrictDto)));
    expect(res.fieldErrors).toHaveProperty('extra');
    expect(res).not.toHaveProperty('error');
  });

  it('drops unknown fields on a protocol wire DTO and passes the rest through', async () => {
    const out = (await pipe.transform(
      { client_name: 'abc', uris: ['x'], logo_uri: 'https://x' },
      body(WireDto),
    )) as WireDto;
    expect(out).toBeInstanceOf(WireDto);
    expect(out).toEqual({ client_name: 'abc', uris: ['x'] });
  });

  it("adds the standard's error code (chosen from the bad fields) next to detail + fieldErrors", async () => {
    const res = await rejection(pipe.transform({ client_name: 'abc', uris: 'nope' }, body(WireDto)));
    expect(res).toMatchObject({
      error: 'invalid_redirect_uri',
      fieldErrors: expect.objectContaining({ uris: expect.any(String) }),
    });
    expect(res.error_description).toBe(res.detail);

    const meta = await rejection(pipe.transform({ client_name: 'too long', uris: [] }, body(WireDto)));
    expect(meta.error).toBe('invalid_meta');
  });

  it('accepts a fixed error code and still forbids unknown fields when not told to ignore them', async () => {
    const res = await rejection(pipe.transform({ name: 'a', extra: 1 }, body(FixedCodeDto)));
    expect(res.error).toBe('fixed_code');
  });

  it('leaves primitives and non-DTO params alone', async () => {
    expect(await pipe.transform('7', { type: 'param', metatype: String })).toBe('7');
  });
});
