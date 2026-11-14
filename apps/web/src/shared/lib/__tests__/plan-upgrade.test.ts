import { ApiError } from '@appshore/web-core/shared/lib/api';
import {
  PLAN_UPGRADE_PATH,
  planUpgradePromptFor,
  showPlanUpgradePrompt,
} from '@appshore/web-core/shared/lib/plan-upgrade';

const mockToastError = jest.fn();
jest.mock('@app/ui', () => ({ toast: { error: (...args: unknown[]) => mockToastError(...args) } }));

const apiError = (status: number, body: Record<string, unknown>) =>
  new ApiError(status, String(body.detail ?? ''), { statusCode: status, ...body });

/** A plan gate answers `code` and `detail` only; the web builds its upgrade prompt from `code`. */
describe('plan upgrade prompt', () => {
  beforeEach(() => mockToastError.mockReset());

  it('turns PLAN_UPGRADE_REQUIRED into an upgrade prompt that shows the detail', () => {
    const detail = 'This feature needs the Professional plan or higher.';
    expect(planUpgradePromptFor(apiError(403, { code: 'PLAN_UPGRADE_REQUIRED', detail }))).toEqual({
      code: 'PLAN_UPGRADE_REQUIRED',
      title: 'Upgrade to use this feature',
      detail,
      href: PLAN_UPGRADE_PATH,
    });
  });

  it('turns USER_LIMIT_REACHED into an upgrade prompt about seats', () => {
    const prompt = planUpgradePromptFor(
      apiError(403, { code: 'USER_LIMIT_REACHED', detail: 'All 5 users are in use.' }),
    );
    expect(prompt).toMatchObject({ code: 'USER_LIMIT_REACHED', title: 'Your plan has no free seats' });
  });

  it('leaves every other error alone', () => {
    expect(planUpgradePromptFor(apiError(403, { code: 'FORBIDDEN', detail: 'No.' }))).toBeNull();
    expect(planUpgradePromptFor(apiError(403, { code: 'FEATURE_DISABLED', detail: 'Off.' }))).toBeNull();
    expect(planUpgradePromptFor(new Error('PLAN_UPGRADE_REQUIRED'))).toBeNull();
    expect(showPlanUpgradePrompt(apiError(500, { code: 'INTERNAL', detail: 'x' }))).toBe(false);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('shows one toast with a link to the plans page, and says it handled the error', () => {
    expect(showPlanUpgradePrompt(apiError(403, { code: 'PLAN_UPGRADE_REQUIRED', detail: 'Needs Enterprise.' }))).toBe(
      true,
    );
    expect(mockToastError).toHaveBeenCalledTimes(1);
    const [title, options] = mockToastError.mock.calls[0];
    expect(title).toBe('Upgrade to use this feature');
    expect(options).toMatchObject({ description: 'Needs Enterprise.', action: { label: 'View plans' } });
  });
});
