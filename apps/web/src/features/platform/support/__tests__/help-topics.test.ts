import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canRoleOpen, type UserRole } from '@appshore/web-core/shared/lib/navigation';
import { HELP_TOPICS, helpTopicsFor } from '../help-topics';

const ROLES: UserRole[] = ['OWNER', 'ADMIN', 'MEMBER', 'SUPER_ADMIN'];
const titles = (role: UserRole | undefined) => helpTopicsFor(role).map((t) => t.title);

describe('canRoleOpen', () => {
  it('opens the Setup Hub for workspace admins only', () => {
    expect(canRoleOpen('/onboarding', 'OWNER')).toBe(true);
    expect(canRoleOpen('/onboarding', 'ADMIN')).toBe(true);
    expect(canRoleOpen('/onboarding', 'MEMBER')).toBe(false);
    expect(canRoleOpen('/onboarding', 'SUPER_ADMIN')).toBe(false);
  });

  it('opens a Settings screen for the roles whose Settings panel lists it', () => {
    expect(canRoleOpen('/settings/profile', 'MEMBER')).toBe(true);
    expect(canRoleOpen('/settings/members', 'MEMBER')).toBe(false);
    expect(canRoleOpen('/settings/members', 'ADMIN')).toBe(true);
    expect(canRoleOpen('/settings/subscription', 'SUPER_ADMIN')).toBe(false);
    expect(canRoleOpen('/settings/profile', 'SUPER_ADMIN')).toBe(true);
  });

  it('keeps /admin for the super admin', () => {
    expect(canRoleOpen('/admin/tenants', 'SUPER_ADMIN')).toBe(true);
    expect(canRoleOpen('/admin/tenants', 'OWNER')).toBe(false);
  });

  it('opens nothing without a role', () => {
    expect(canRoleOpen('/settings/profile', undefined)).toBe(false);
  });
});

describe('helpTopicsFor', () => {
  it.each(ROLES)('shows %s only tiles whose target that role can open', (role) => {
    for (const topic of helpTopicsFor(role)) {
      expect(canRoleOpen(topic.href, role)).toBe(true);
    }
  });

  it('shows a workspace admin every tile', () => {
    expect(titles('OWNER')).toEqual(HELP_TOPICS.map((t) => t.title));
    expect(titles('ADMIN')).toEqual(HELP_TOPICS.map((t) => t.title));
  });

  // The Setup Hub sends anyone but OWNER and ADMIN back to the home page.
  it('does not send a member or a super admin to the Setup Hub', () => {
    expect(titles('MEMBER')).not.toContain('Getting Started');
    expect(titles('SUPER_ADMIN')).not.toContain('Getting Started');
  });

  it('shows a member and a super admin no admin-only tile', () => {
    expect(titles('MEMBER')).toEqual([]);
    expect(titles('SUPER_ADMIN')).toEqual([]);
  });

  it('shows nothing before the role is known', () => {
    expect(titles(undefined)).toEqual([]);
  });
});

describe('the Setup Hub page', () => {
  // The page's own gate and the tile filter read one rule, so they cannot drift.
  it('gates on the shared route rule, not a role list of its own', () => {
    const page = readFileSync(join(__dirname, '../../../../app/onboarding/page.tsx'), 'utf8');
    expect(page).toContain("canRoleOpen('/onboarding'");
    expect(page).not.toMatch(/role\s*[!=]==\s*'(OWNER|ADMIN)'/);
  });
});
