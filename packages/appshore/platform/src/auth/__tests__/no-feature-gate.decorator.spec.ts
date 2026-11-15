import { Controller, Get, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY, RequireFeature } from '../decorators/require-feature.decorator';
import { NO_FEATURE_GATE_KEY, NoFeatureGate } from '../decorators/no-feature-gate.decorator';
import { PlanGuard } from '../guards/plan.guard';

@Controller('paid')
@RequireFeature('api_keys')
class PaidController {
  @Get('front-door')
  @NoFeatureGate()
  frontDoor() {
    return {};
  }

  /** The trap: reads as ungated in the source, but `getAllAndOverride` skips an undefined value. */
  @Get('looks-open')
  @SetMetadata(FEATURE_KEY, undefined)
  looksOpen() {
    return {};
  }

  @Get('board')
  board() {
    return {};
  }
}

/** A controller cannot opt its whole surface out in one line: the key is read from the handler only. */
@Controller('whole')
@RequireFeature('api_keys')
@NoFeatureGate()
class WholeController {
  @Get()
  list() {
    return [];
  }
}

describe('@NoFeatureGate', () => {
  const reflector = new Reflector();
  const assertFeature = jest.fn().mockResolvedValue(undefined);
  const guard = new PlanGuard(reflector, { assertFeature } as never);
  const ctx = (cls: any, handler: string): ExecutionContext =>
    ({
      getHandler: () => cls.prototype[handler],
      getClass: () => cls,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: 'MEMBER', tenantId: 't', tenantDbId: 1 }, method: 'GET', url: '/' }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => assertFeature.mockClear());

  it('opens one route under a gated controller', async () => {
    await guard.canActivate(ctx(PaidController, 'frontDoor'));
    expect(assertFeature).not.toHaveBeenCalled();
  });

  it('opts out by its own key, not by writing undefined over the feature key (that route stays gated)', async () => {
    expect(reflector.get(NO_FEATURE_GATE_KEY, PaidController.prototype.frontDoor)).toBe(true);
    await guard.canActivate(ctx(PaidController, 'looksOpen'));
    expect(assertFeature).toHaveBeenCalledWith(1, 'api_keys', expect.anything());
  });

  it('leaves every other route of the controller gated', async () => {
    await guard.canActivate(ctx(PaidController, 'board'));
    expect(assertFeature).toHaveBeenCalledWith(1, 'api_keys', expect.anything());
  });

  it('on a class it opens nothing', async () => {
    await guard.canActivate(ctx(WholeController, 'list'));
    expect(assertFeature).toHaveBeenCalledWith(1, 'api_keys', expect.anything());
  });
});
