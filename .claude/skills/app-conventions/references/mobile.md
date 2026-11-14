---
owner: foundation
requires: mobile
sources:
  - apps/mobile/lib/main.dart#CompanionApp
  - apps/mobile/lib/core/api_client.dart#ApiClient
  - apps/mobile/lib/core/api_client.dart#ApiException
  - apps/mobile/lib/core/app_config.dart#AppConfig
  - apps/mobile/lib/features/auth/login_screen.dart
  - apps/mobile/lib/features/status/status_screen.dart
  - apps/mobile/pubspec.yaml
  - apps/mobile/analysis_options.yaml
guards:
  - apps/mobile/test/api_client_test.dart
  - script:mobile:test
examples:
  - jsonStr
  - jsonInt
  - jsonDouble
  - jsonNum
  - onAuthExpired
  - sessionExpired
  - AsyncView
  - useRootNavigator
  - FutureProvider
  - StateNotifier
  - go_router
  - fromJson
  - flutter_secure_storage
  - SnackBar
  - RefreshIndicator
  - ThemeExtension
  - image_picker
  - Info.plist
  - url_launcher
---

# Mobile: the Flutter companion app

The app under `apps/mobile/` is a pure client of the backend: it calls the API as it is, never drives an API change,
and re-implements no business logic in Dart. The native layer does OS work only (camera, notifications, deep links,
secure storage).

## What is there today

A scaffold: `lib/main.dart` (the `CompanionApp` root with two tabs), `lib/core/api_client.dart` (`ApiClient` over the
`http` package: base URL, bearer token, JSON, and `ApiException` built from the error envelope),
`lib/core/app_config.dart` (`AppConfig`: `API_BASE_URL` and `APP_NAME` from `--dart-define`),
`lib/features/status/` (the backend health screen) and `lib/features/auth/` (a sign-in scaffold). Its only
dependency beyond Flutter is `http`; there is no state library, router, secure storage, refresh handling or request
timeout yet. The rules below are how it grows; the ones marked "when you add" describe code that does not exist yet.

## Rules

### Layers and code quality

- `flutter analyze` is clean and `flutter test` is green before every commit (`pnpm mobile:test`).
  [guard: script:mobile:test]
- Layers point one way: widget → state (provider or controller) → repository → `ApiClient`. A widget never calls the
  HTTP client, parses JSON or holds business logic in `build`. [review-only: no Dart spec reads imports]
- A feature is a folder under `lib/features/<area>/` with its repository, its state and its screens; a shared widget
  goes in `lib/widgets/` once a third caller needs it. [review-only: needs reading]
- Every controller and subscription is disposed; after every `await`, check `if (!mounted) return;` before touching
  `context` or `setState`. [review-only: the analyzer catches some, not all]
- When you add libraries, keep to one set: Riverpod for state (auto-disposing `FutureProvider` for reads, repository
  providers, a `StateNotifier` for a rich flow), Dio once you outgrow `http`, `go_router` with an auth-gated
  `redirect`. Never mix paradigms. [review-only: needs judgement]

### Models

- A model is a plain immutable class with a `const` constructor and named parameters. `fromJson` coerces every field
  through one shared set of helpers (`jsonStr`, `jsonInt`, `jsonDouble`, `jsonNum` in one `lib/core/json.dart`,
  added with the first model), never a hard cast: a cast throws on an unexpected type and blanks the whole screen.
  [review-only: no Dart spec scans for casts]
- Parse only the fields the UI uses; derived display logic is a getter on the model, not code in a widget.
  [review-only: needs reading]

### The API client

- `lib/core/api_client.dart` is the one HTTP entry point. An error answer is one envelope: `ApiException` carries
  `detail` as its message, `code` and `fieldErrors`; there is no `message` key, and a screen never sees a raw
  transport exception. [guard: apps/mobile/test/api_client_test.dart]
- When you add real sessions: a hard timeout on every request (connect about 12 s, send and receive about 20 s; a
  request with no timeout is the "stuck skeleton" bug), the access token in `flutter_secure_storage`, the refresh
  cookie in a persistent cookie jar, and 401 → refresh → retry once, then an `onAuthExpired` callback that routes to
  sign-in (`sessionExpired` on the auth controller), never a stranded error card. [review-only: not built yet]
- Base URLs come from `AppConfig`, never a literal in feature code; a non-production build shows its environment.
  [review-only: needs reading]

### Screens and feedback

- Every async surface renders three states through one shared widget (an `AsyncView`): loading as a shaped skeleton,
  error as a card with Try again (never an endless skeleton), empty as its own state with an icon, title and line.
  [review-only: no Dart spec checks states]
- Every mutation shows a success and an error `SnackBar`; a busy button shows progress inside itself, never a
  blocking overlay; a list screen refreshes with `RefreshIndicator`. [review-only: needs reading]

### Theme, routing and native

- The theme is built from the web tokens in `packages/ui/src/styles/globals.css` and exposed through a
  `ThemeExtension`; status colours live in one theme file mirroring the web's tones; light and dark both work. No hex
  in a widget. The scaffold's `ThemeData` still seeds from one hex colour in `lib/main.dart`; replace it when the
  theme file lands. [review-only: no Dart spec scans colours]
- Routing (when you add it): an auth-gated redirect, tabs under a shell route, full-screen detail routes at the top
  level, custom-scheme deep links that mirror the in-app routes. A bottom sheet opened from inside a tab shell uses
  `useRootNavigator: true`, or floating chrome draws over it. [review-only: not built yet]
- Native work: camera and library through `image_picker` with the usage strings in `Info.plist`; notification
  permission asked after sign-in, not at cold boot; anything not built natively opens in the browser
  (`url_launcher`) rather than as a broken stub. [review-only: not built yet]

## Recipe: add a screen

1. Add `lib/features/<area>/` with a repository that wraps `ApiClient` and returns models parsed with the shared
   JSON helpers.
2. Add the state that calls the repository (a provider once Riverpod is in), and invalidate it after a write.
3. Add the screen: the three states, a `SnackBar` for each write's outcome, theme colours only.
4. Add a test under `apps/mobile/test/` with a `MockClient` from `package:http/testing.dart`, the way
   `api_client_test.dart` does.
5. Run `pnpm mobile:test`.

## Flag in review

- An endpoint called that the backend does not have, or business logic re-done in Dart.
- A hard cast in `fromJson`, or JSON helpers declared per model.
- HTTP, parsing or logic inside `build`.
- A request with no timeout, or a sheet from a tab shell without the root navigator.
- A hex colour in a widget.
- `flutter analyze` warnings in the diff.
