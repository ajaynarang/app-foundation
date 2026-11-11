import { declaredClasses, inputParams, isDtoClass, typeOnlyImports } from './request-dto.scan';

describe('request-dto scan', () => {
  it('reads pick-params, DTO params, inline and generic types across lines', () => {
    const signature = `async list(
      @CurrentUser() user: AuthUser,
      @Query('limit') limit?: string,
      @Query() query: ThingQueryDto,
      @Body() body: { confirm?: boolean; nested: { a: string } },
      @Body() other: Record<string, unknown>,
      @Body('reason', TrimPipe) reason?: string,
      @Body() raw,
      @Body() { token }: TokenDto,
      @Query('limit', new DefaultValuePipe(50), ParseIntPipe) capped: number,
      @Query('state', new ParseEnumPipe(State, { optional: true })) state: State | undefined,
      @Body(new ValidationPipe({ whitelist: true })) loose: any,
    ): Promise<void> {`;
    expect(inputParams(signature)).toEqual([
      { decorator: 'Query', pick: 'limit', type: 'string' },
      { decorator: 'Query', pick: null, type: 'ThingQueryDto' },
      { decorator: 'Body', pick: null, type: '{ confirm?: boolean; nested: { a: string } }' },
      { decorator: 'Body', pick: null, type: 'Record<string, unknown>' },
      { decorator: 'Body', pick: 'reason', type: 'string' },
      { decorator: 'Body', pick: null, type: '' },
      { decorator: 'Body', pick: null, type: 'TokenDto' },
      { decorator: 'Query', pick: 'limit', type: 'number' },
      { decorator: 'Query', pick: 'state', type: 'State | undefined' },
      { decorator: 'Body', pick: null, type: 'any' },
    ]);
  });

  it('a default value ends the type', () => {
    expect(inputParams('f(@Query() q: QDto = new QDto()) {')).toEqual([
      { decorator: 'Query', pick: null, type: 'QDto' },
    ]);
  });

  it('collects declared classes', () => {
    const classes = declaredClasses([
      'export class ADto {}\nabstract class B {}',
      'interface C {}\nexport abstract class D {}',
    ]);
    expect([...classes].sort()).toEqual(['ADto', 'B', 'D']);
  });

  it('collects type-only imports (whole-statement and inline, aliased)', () => {
    const src = `import type { ADto, B as BDto } from './a';\nimport { CDto, type DDto, type E as EDto } from './c';`;
    expect([...typeOnlyImports(src)].sort()).toEqual(['ADto', 'BDto', 'DDto', 'EDto']);
  });

  it('a DTO is a declared class imported as a value', () => {
    const classes = new Set(['ADto', 'BDto']);
    expect(isDtoClass('ADto', classes, new Set())).toBe(true);
    expect(isDtoClass('ADto', classes, new Set(['ADto']))).toBe(false);
    expect(isDtoClass('ADto[]', classes, new Set())).toBe(false);
    expect(isDtoClass('SomeInterface', classes, new Set())).toBe(false);
    expect(isDtoClass('', classes, new Set())).toBe(false);
  });
});
