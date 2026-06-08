import { test as base } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createRoleClient, resolveUrl, type RoleApiClient } from '../playwright/api-client.js';
import type { AuthState } from './auth-state.js';

const AUTH_STATE_FILENAME = 'auth-state.json';

function resolveAuthStateDir(): string {
  const d = process.env.SALLY_QA_AUTH_STATE_DIR;
  if (!d) {
    throw new Error(
      'SALLY_QA_AUTH_STATE_DIR env var is not set. ' + 'The Playwright global-setup must export it before tests run.',
    );
  }
  return d;
}

function loadAuthState(): AuthState {
  const p = path.join(resolveAuthStateDir(), AUTH_STATE_FILENAME);
  const raw = fs.readFileSync(p, 'utf-8');
  return JSON.parse(raw);
}

type TestFixtures = {
  authState: AuthState;
  asRole: (role: string) => RoleApiClient;
  asDispatcher: RoleApiClient;
  asAdmin: RoleApiClient;
  asOwner: RoleApiClient;
  asDriver: RoleApiClient;
  asCustomer: RoleApiClient;
  asSuperAdmin: RoleApiClient;
  asAnonymous: RoleApiClient;
};

export const test = base.extend<TestFixtures>({
  authState: async ({}, use) => {
    await use(loadAuthState());
  },

  asRole: async ({ request }, use) => {
    const state = loadAuthState();
    await use((role: string) => {
      const token = state.tokens[role];
      if (!token) {
        throw new Error(
          `No ${role} user available in tenant "${state.tenantName}". ` +
            `Check authState.availableRoles before calling asRole().`,
        );
      }
      return createRoleClient(request, role, token, state.baseUrl);
    });
  },

  asDispatcher: async ({ request }, use) => {
    const state = loadAuthState();
    if (!state.tokens['DISPATCHER']) {
      test.skip(true, `No DISPATCHER in tenant "${state.tenantName}"`);
      return;
    }
    await use(createRoleClient(request, 'DISPATCHER', state.tokens['DISPATCHER'], state.baseUrl));
  },
  asAdmin: async ({ request }, use) => {
    const state = loadAuthState();
    if (!state.tokens['ADMIN']) {
      test.skip(true, `No ADMIN in tenant "${state.tenantName}"`);
      return;
    }
    await use(createRoleClient(request, 'ADMIN', state.tokens['ADMIN'], state.baseUrl));
  },
  asOwner: async ({ request }, use) => {
    const state = loadAuthState();
    if (!state.tokens['OWNER']) {
      test.skip(true, `No OWNER in tenant "${state.tenantName}"`);
      return;
    }
    await use(createRoleClient(request, 'OWNER', state.tokens['OWNER'], state.baseUrl));
  },
  asDriver: async ({ request }, use) => {
    const state = loadAuthState();
    if (!state.tokens['DRIVER']) {
      test.skip(true, `No DRIVER in tenant "${state.tenantName}"`);
      return;
    }
    await use(createRoleClient(request, 'DRIVER', state.tokens['DRIVER'], state.baseUrl));
  },
  asCustomer: async ({ request }, use) => {
    const state = loadAuthState();
    if (!state.tokens['CUSTOMER']) {
      test.skip(true, `No CUSTOMER in tenant "${state.tenantName}"`);
      return;
    }
    await use(createRoleClient(request, 'CUSTOMER', state.tokens['CUSTOMER'], state.baseUrl));
  },
  asSuperAdmin: async ({ request }, use) => {
    const state = loadAuthState();
    if (!state.tokens['SUPER_ADMIN']) {
      test.skip(true, 'No SUPER_ADMIN available');
      return;
    }
    await use(createRoleClient(request, 'SUPER_ADMIN', state.tokens['SUPER_ADMIN'], state.baseUrl));
  },
  asAnonymous: async ({ request }, use) => {
    const state = loadAuthState();
    const r = (url: string) => resolveUrl(url, state.baseUrl);
    await use({
      token: '',
      role: 'ANONYMOUS',
      get: (url, opts = {}) => request.get(r(url), opts),
      post: (url, data?, opts = {}) => request.post(r(url), { data, ...opts }),
      put: (url, data?, opts = {}) => request.put(r(url), { data, ...opts }),
      patch: (url, data?, opts = {}) => request.patch(r(url), { data, ...opts }),
      delete: (url, opts = {}) => request.delete(r(url), opts),
    });
  },
});

export { expect } from '@playwright/test';
