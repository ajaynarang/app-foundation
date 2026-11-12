import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { AI_SETTINGS_WEB_PATH, INTEGRATIONS_WEB_PATH } from '../web-routes';

const WEB_APP_DIR = join(__dirname, '../../../../web/src/app');

/**
 * The OAuth callback returns the browser to INTEGRATIONS_WEB_PATH with the
 * outcome in the query string (`?oauth=connected&vendor=…`). That only reaches
 * the user when the target is a real screen that shows it.
 */
describe('INTEGRATIONS_WEB_PATH', () => {
  const pagePath = join(WEB_APP_DIR, INTEGRATIONS_WEB_PATH, 'page.tsx');

  it('is a page of the web app', () => {
    expect(existsSync(pagePath)).toBe(true);
  });

  // It was /settings, which redirects to /settings/general and dropped the query.
  it('is not a page that redirects away', () => {
    expect(readFileSync(pagePath, 'utf8')).not.toMatch(/\bredirect\(/);
  });

  it('sits under a layout that shows the OAuth result', () => {
    const segments = INTEGRATIONS_WEB_PATH.split('/').filter(Boolean);
    const layouts = segments
      .map((_, i) => join(WEB_APP_DIR, ...segments.slice(0, i + 1), 'layout.tsx'))
      .filter((file) => existsSync(file))
      .map((file) => readFileSync(file, 'utf8'));
    const pageAndLayouts = [readFileSync(pagePath, 'utf8'), ...layouts];

    expect(pageAndLayouts.some((source) => source.includes('<OAuthReturnNotice />'))).toBe(true);
  });
});

/** The failing-key and budget notices, and the chat's connect-your-key link, send people here. */
describe('AI_SETTINGS_WEB_PATH', () => {
  it('is a page of the web app', () => {
    expect(existsSync(join(WEB_APP_DIR, AI_SETTINGS_WEB_PATH, 'page.tsx'))).toBe(true);
  });
});
