---
name: mobile-patterns
description: Use when implementing, modifying, reviewing, or planning any feature in the Flutter companion app (apps/mobile) — screens, widgets, state management, the API client, models, theme, sheets, native capabilities (camera/notifications/deep-links), auth, and env config.
---

# Mobile Patterns

Reference for the **Flutter companion app** (`apps/mobile/`). A cross-platform native client of the backend API, installable from the App Store / Play Store.

**Current state:** the app ships as a scaffold — `lib/core/api_client.dart` + `lib/core/app_config.dart`, `lib/features/auth/`, `lib/features/status/`, `lib/main.dart`. These patterns govern how you grow it. They were battle-tested in a production Flutter app against this same backend architecture — follow them and you skip the painful lessons.

**Golden rule:** the app is a **pure client** of the existing NestJS backend. It reuses backend APIs **unchanged** — no API changes driven from mobile, no business logic re-implemented in Dart. The native layer does OS integration only (camera, notifications, deep links, secure storage).

---

## 0. Code Quality Principles (apply to ALL Dart code)

### SOLID (adapted for Flutter)

- **Single Responsibility** — one widget, one purpose. A screen that fetches, parses, and lays out is three things: data goes in a **repository**, async state in a **provider/controller**, layout in the **widget**.
- **Open/Closed** — extend via composition (child widgets, callbacks) not by growing `if (variant == ...)` inside a widget.
- **Liskov** — a custom button/card honors the same contract as the Material one it wraps.
- **Interface Segregation** — a widget takes only the fields it renders, not a whole model when it needs `{name, status}`. (Exception: passing a small immutable model object is fine and often clearer.)
- **Dependency Inversion** — widgets depend on state providers, never call the HTTP client directly. Data access goes through a repository.

### KISS / DRY / YAGNI

- Simplest widget that works. No abstraction until a **third** caller proves it.
- Extract a shared widget/util when the same code appears **three times** (two is coincidence).
- JSON coercion helpers live **once** in a shared `lib/core/json.dart`-style file — never re-declare per model.
- No prop "just in case", no dead flags, no commented-out code.

### Non-negotiables

- `flutter analyze` MUST be clean (zero issues) before every commit; `flutter test` green.
- No business logic, no HTTP calls, no JSON parsing inside a widget's `build`.
- Every `…Controller` / `…Subscription` is disposed.
- After every `await`, guard `if (!mounted) return;` before touching `context`/`setState`.

---

## Architecture (strict layering)

```
lib/
  main.dart            — boot: config, client wiring, root widget
  core/
    app_config.dart    — build-time env (--dart-define); local/staging/prod base URLs
    api_client.dart    — the ONE HTTP entry point (timeouts, auth header, refresh)
    (as the app grows: theme/, storage/, json.dart, notifications, deep-link handling)
  features/<area>/     — auth, status, <your features>
                         each: repository (data), state (provider/controller), screens/widgets
  (widgets/            — cross-feature: async_view (loading/error-retry/empty), skeleton/card/badge)
```

**Layering (strict):** `widget → state (provider/controller) → repository → ApiClient`.
A widget never skips a layer.

**Sanctioned library choices when the app grows** (keep consistent — don't mix paradigms):

- State: **Riverpod** (`FutureProvider.autoDispose` for reads, repository `Provider`s, `StateNotifier` for rich flows)
- HTTP: **Dio** (interceptors + cookie jar) once you outgrow `http`
- Routing: **go_router** with an auth-gated `redirect`

---

## 1. Models (plain Dart, defensive parsing)

- Plain immutable classes, `const` constructors, named params.
- `factory X.fromJson(Map<String, dynamic> j)` — **always coerce**, never hard-cast.
  A `j['x'] as String?` throws `_TypeError` when the API returns a number and blanks the whole screen.

```dart
import '../core/json.dart';

factory TaskSummary.fromJson(Map<String, dynamic> j) => TaskSummary(
      id: jsonInt(j['id']),
      status: jsonStr(j['status']),
      progress: jsonDouble(j['progress'] ?? j['pct']),   // tolerate alt field names
    );
```

- Define `jsonStr` / `jsonNum` / `jsonInt` / `jsonDouble` coercion helpers ONCE in `lib/core/json.dart`. **Never** redeclare per-model helpers.
- Parse only the fields the UI uses; the backend returns far more. Tolerate alternate field names with `??`.
- Put display/derived logic as getters on the model (`displayName`, `isCompleted`), not in widgets.

---

## 2. API Client — the one HTTP entry point

`lib/core/api_client.dart` is the **only** place HTTP is configured. Key invariants:

- **Hard timeouts on every request** (connect ~12s, receive/send ~20s). A request with no timeout is the documented cause of "stuck skeleton" hangs — never regress this.
- **Auth header interceptor** attaches the access token from secure storage (skip for auth endpoints).
- **401 → refresh → retry once.** On a 401, call the refresh endpoint (cookie-based), store the new access token, retry the original request once. If refresh fails on an authed request → clear the token + fire an `onAuthExpired` callback.
- **`onAuthExpired` must route to login.** Wire it to the auth state so the router bounces to the login screen instead of stranding the user on an error card.
- **Persist the refresh credential.** The access token lives in Keychain/Keystore (`flutter_secure_storage`) and survives restarts — the refresh cookie MUST persist too (a persistent cookie jar, never in-memory). Otherwise the first 401 after relaunch can't refresh and strands the user.
- Verb helpers (`get/post/patch/put`) return decoded JSON or throw a typed, user-presentable `ApiException` (`isTimeout`, `isAuth`, server `message`). Screens never see a raw transport exception.

---

## 3. State Management

- **Reads → auto-disposing async providers** (keyed by id where needed). Auto-dispose so leaving a screen frees it; re-run via invalidation.
- **Mutations → repository method called from the widget's controller** (local busy/error state), then invalidate the read provider to refresh. For richer flows (streaming chat), use a state notifier.
- Repositories wrap the ApiClient and are provided once; the client singleton is wired at boot (interceptors + cookie jar must be stable).
- Never put a whole provider result object in a dependency; depend on stable values.
- Derive the current user/session id from auth state in one place — all user-scoped reads watch it.

---

## 4. Screens & Loading/Feedback (3-state, NON-NEGOTIABLE)

Every async surface renders **three** states via a shared `AsyncView`-style widget:

- **loading** → a shaped `Skeleton` matching the layout (NOT a bare spinner, NOT null)
- **error** → an error card with a **Try again** button (NEVER an infinite skeleton)
- **empty** → a distinct empty state (icon + title + subtitle), different from error

```dart
AsyncView<Dashboard>(
  value: ref.watch(dashboardProvider),
  onRetry: () => ref.invalidate(dashboardProvider),
  loading: const _DashboardSkeleton(),
  data: (data) => _DashboardBody(data: data),
)
```

- Every mutation shows feedback: a success `SnackBar` and an error `SnackBar` (destructive color from theme tokens).
- Buttons show in-button progress while busy (`CircularProgressIndicator` inside the button), never a blocking overlay.
- Pull-to-refresh on list screens via `RefreshIndicator` → refresh the provider.

---

## 5. Theme (mirror the web tokens)

- Build `ThemeData` from the web app's design tokens (`packages/ui/src/styles/globals.css`) so mobile and web read as one product.
- Expose semantic colors via a `ThemeExtension` (`context.tokens.accent / caution / critical / muted / border / card / foreground`). Use these — do NOT hardcode hex.
- Status → color mapping lives in one theme file, mirroring the web's status color map.
- Full light + dark support; `themeMode` driven by user preference.
- Use the real brand asset for logo touchpoints — never hand-draw an approximation.

---

## 6. Routing & Sheets

- Auth-gated redirect at the router level: `unknown → splash`, signed-out → login, signed-in on an auth screen → home. Bridge auth state into the router's refresh listenable.
- Tabs live under a shell route; full-screen detail routes are top-level with their own back button.
- **Custom scheme deep links** mirror in-app routes (`yourapp://task/123` → task detail).
- **Bottom sheets opened from inside a tab shell MUST use the root navigator** (`useRootNavigator: true`). Otherwise they push onto the shell's inner navigator, modal observers never see them, and any global floating chrome renders **on top of** the sheet.
- Sheet vs full screen: bottom sheet for quick actions/forms (report, upload, pickers); full screen for detail views.

---

## 7. Global floating chrome (if you add any)

If the app grows persistent floating UI (an assistant orb, a status pill):

- Gate it per tab — hide it where it collides with the tab's purpose (e.g. over a chat composer).
- Hide it whenever any sheet is open (track modal state with a route observer).
- Float it **above** the bottom tab bar with clearance — never overlapping a tab.

---

## 8. Native Capabilities

- **Camera/library** (`image_picker`) for document/photo capture. `Info.plist` carries `NSCameraUsageDescription` + `NSPhotoLibraryUsageDescription`.
- **Uploads = 3-step presigned flow, mandatory confirm:** `POST /documents/presign-upload` → `PUT uploadUrl` (raw bytes) → `POST /documents/:id/confirm`. Match the backend's document-type registry codes exactly (case-sensitive). Never mark an upload "done" until confirm returns.
- **Notifications**: request permission _after_ login (not at cold boot); background/unfocused only; tap → deep link.
- **Redirect-to-external** (`url_launcher`): maps, the full web app, legal pages, `tel:` links. Anything not built natively redirects rather than shipping a broken stub.

---

## 9. Auth Flow

- Primary: the backend's first-party auth (email+password `POST /auth/login`, or phone OTP endpoints where enabled) → `{accessToken, user}` with the refresh token in an httpOnly cookie.
- Access token in `flutter_secure_storage`; refresh cookie in the persistent jar.
- An `AuthController` holds `AuthState{status, user}`. On boot, `restore()` validates the stored token via `GET /auth/me`. `sessionExpired()` (called by `ApiClient.onAuthExpired`) flips to signed-out → router → login.

---

## 10. Env & Config

- Build-time env via `--dart-define` (e.g. `APP_ENV=local|staging|prod`), read in `lib/core/app_config.dart`. Optional API base override.
- Expose `apiBase`, `webBase` (for redirect-to-external), and an `envLabel` (show a STAGING chip in non-prod builds).
- Local API default matches the backend dev port; never hardcode URLs in feature code.

---

## 11. Testing & Verification

- Gate: **`flutter analyze` clean + `flutter test` green + build + run-on-simulator verification** (`cd apps/mobile && flutter analyze && flutter test`).
- Verify against a live backend as a real user for end-to-end flows.
- Ad-hoc screenshots go under a gitignored `.screenshots/` directory — never the repo root.

---

## 12. Common Pitfalls (learned the hard way)

| Pitfall                                            | Rule                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Screen blanks with "Something went wrong" on a 200 | A model `fromJson` hard-cast (`as String?`) threw on an unexpected type. Use shared JSON coercion. |
| Sudden "Unauthorized" after a while                | In-memory cookie storage lost the refresh cookie on restart. Persist it.                           |
| Stuck on "Unauthorized", no login                  | Refresh failed but nothing routed to login. Wire `onAuthExpired → sessionExpired`.                 |
| Floating chrome renders over a sheet               | Sheet used the inner navigator. Use `useRootNavigator: true`.                                      |
| Upload 400s                                        | Document type didn't match the backend registry code (case-sensitive).                             |
| Infinite skeleton on a hung request                | No timeout. Set hard timeouts; render the error-retry state, never an endless skeleton.            |

---

## What NOT to do

- Do NOT change or call backend endpoints that don't already exist. This app is a pure client.
- Do NOT re-implement business logic in Dart — read it from the API.
- Do NOT hardcode colors — use theme tokens.
- Do NOT use an HTTP client without hard timeouts, or bottom sheets from a tab shell without the root navigator.
- Do NOT redeclare JSON coercion helpers — one shared file.
- Do NOT leave `flutter analyze` with warnings before committing.
