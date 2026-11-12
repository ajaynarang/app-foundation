import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, Patch, Post, Res } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiExcludeController,
  ApiExcludeEndpoint,
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiTags,
  IntersectionType,
} from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '@appshore/platform/auth/decorators/public.decorator';
import { ApiResult, defineResponseSchema } from '@appshore/platform/shared/openapi/api-result';
import { auditOpenApiDocument } from '../openapi-audit';
import { applyGlobalPrefix, buildOpenApiDocument } from '../openapi';

const Gadget = defineResponseSchema('OpenApiAuditGadget', z.object({ id: z.string() }));

class GadgetBodyDto {
  @ApiProperty()
  name!: string;
}
class ExtraDto {
  @ApiProperty()
  colour!: string;
}
/** A composed body is documented through `allOf`. */
class ComposedBodyDto extends IntersectionType(GadgetBodyDto, ExtraDto) {}
class EmptyBodyDto {
  name!: string;
}

@ApiTags('Gadgets')
@Controller('gadgets')
class CompleteController {
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create' })
  @ApiResult(Gadget, HttpStatus.CREATED)
  create(@Body() _dto: GadgetBodyDto) {}

  @Patch(':gadget_id')
  @ApiOperation({ summary: 'Update' })
  @ApiParam({ name: 'gadget_id', description: 'The gadget' })
  @ApiResult(Gadget)
  update(@Param('gadget_id') _id: string, @Body() _dto: ComposedBodyDto) {}

  @Delete(':gadget_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete' })
  @ApiParam({ name: 'gadget_id', description: 'The gadget' })
  @ApiNoContentResponse()
  remove(@Param('gadget_id') _id: string) {}

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Public: no schema needed' })
  open() {}

  @Get('stream')
  @ApiOperation({ summary: 'Writes its own response' })
  stream(@Res() _res: unknown) {}

  @Get('hidden')
  @ApiExcludeEndpoint()
  hidden() {}

  /** A getter on the prototype is not a route, and reading the routes must never run it. */
  private get settings(): string {
    throw new Error('a getter ran against the prototype');
  }
}

@ApiExcludeController()
@Controller('levers')
class LeverController {
  @Get()
  pull() {}
}

@Controller('broken')
class BrokenController {
  @Get(':thing_id')
  get(@Param('thing_id') _id: string) {}

  @Patch()
  @ApiOperation({ summary: 'Wrong status' })
  @ApiResult(Gadget, HttpStatus.CREATED)
  patch(@Body() _dto: EmptyBodyDto) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'No schema' })
  @ApiNoContentResponse()
  queue() {}
}

async function audit(...controllers: Array<new (...args: never[]) => unknown>) {
  @Module({ controllers })
  class AuditModule {}
  const app = await NestFactory.create(AuditModule, { preview: true, logger: false });
  applyGlobalPrefix(app);
  const problems = auditOpenApiDocument(app, buildOpenApiDocument(app));
  await app.close();
  return problems;
}

describe('auditOpenApiDocument (swagger completeness)', () => {
  it('passes a complete controller; public, @Res and excluded routes need no response schema', async () => {
    expect(await audit(CompleteController, LeverController)).toEqual([]);
  });

  it('names every gap: summary, param description, success status, schema, body properties', async () => {
    const problems = await audit(BrokenController);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/BrokenController_get .*no @ApiOperation summary/),
        expect.stringMatching(/BrokenController_get .*path param \{thing_id\} has no @ApiParam description/),
        expect.stringMatching(/BrokenController_get .*the 200 response has no schema/),
        expect.stringMatching(/BrokenController_patch .*documents 201 success response\(s\); the route answers 200/),
        expect.stringMatching(/BrokenController_patch .*request body EmptyBodyDto documents no properties/),
        expect.stringMatching(/BrokenController_queue .*documents 204 success response\(s\); the route answers 202/),
      ]),
    );
  });
});
