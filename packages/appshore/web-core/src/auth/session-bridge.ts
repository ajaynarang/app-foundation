/**
 * Session bridge — the ONLY seam between @appshore/web-core and the app's
 * auth feature. web-core never imports app code; instead the app registers
 * its Zustand auth store here (see features/auth), and core modules (api
 * client, SSE provider, console-url) read the session through this bridge.
 */

export interface SessionUser {
  id?: number | string;
  email?: string;
  [key: string]: unknown;
}

export interface SessionState {
  accessToken: string | null;
  isAuthenticated: boolean;
  user: SessionUser | null;
  setTokens(accessToken: string): void;
  setUser(user: SessionUser): void;
  signOut(): Promise<void> | void;
}

/** Shape of a bound Zustand store hook over the session state. */
export type SessionStoreHook = {
  (): SessionState;
  <T>(selector: (state: SessionState) => T): T;
  getState(): SessionState;
};

let store: SessionStoreHook | null = null;

export function registerSessionStore(hook: SessionStoreHook): void {
  store = hook;
}

export function getSessionStore(): SessionStoreHook {
  if (!store) {
    throw new Error(
      '@appshore/web-core: no session store registered. Import your auth feature ' +
        '(which calls registerSessionStore) before using the api client / SSE provider.',
    );
  }
  return store;
}

/** Reactive hook over the registered session store. */
export function useSession(): SessionState {
  return getSessionStore()();
}
