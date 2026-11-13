import { UserRole } from '@appshore/db';
import { AI_SETTINGS_WEB_PATH } from '../../../../../shared/web-routes';
import { AI_NOT_CONFIGURED_DETAIL } from '../../ai-not-configured.error';
import { aiKeysViewer, budgetReachedChatCopy, notConfiguredChatCopy } from '../connect-key-copy';

const LINK = `](${AI_SETTINGS_WEB_PATH})`;

describe('connect-your-key copy', () => {
  describe.each([
    ['the budget message', budgetReachedChatCopy],
    ['the not-configured message', notConfiguredChatCopy],
  ])('%s', (_name, copy) => {
    it('links an owner to AI Keys when the deployment allows workspace keys', () => {
      expect(copy(aiKeysViewer(UserRole.OWNER, true))).toContain(LINK);
    });

    it.each([UserRole.ADMIN, UserRole.MEMBER, null])('tells a %s to ask the workspace owner, with no link', (role) => {
      const text = copy(aiKeysViewer(role, true));
      expect(text).not.toContain(LINK);
      expect(text).toMatch(/Ask the workspace owner/);
    });

    it.each([UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER])(
      'offers no key at all to a %s when the deployment has bring-your-own-key off',
      (role) => {
        const text = copy(aiKeysViewer(role, false));
        expect(text).not.toContain(LINK);
        expect(text).not.toMatch(/own AI key/);
      },
    );
  });

  it("keeps the deployment's own not-configured message when workspace keys are off", () => {
    expect(notConfiguredChatCopy(aiKeysViewer(UserRole.OWNER, false))).toBe(AI_NOT_CONFIGURED_DETAIL);
  });
});
