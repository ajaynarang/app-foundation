---
owner: foundation
requires: mobile
sources:
  - apps/mobile/lib/main.dart#CompanionApp
  - apps/mobile/lib/core/api_client.dart#ApiClient
  - apps/mobile/lib/core/api_client.dart#ApiException
  - apps/mobile/lib/core/app_config.dart#AppConfig
  - apps/mobile/lib/core/json.dart#jsonStr
  - apps/mobile/lib/core/cursor_page.dart#CursorPage
  - apps/mobile/lib/widgets/async_view.dart#AsyncView
  - apps/mobile/lib/features/auth/auth_controller.dart#AuthController
  - apps/mobile/lib/features/auth/auth_repository.dart#AuthRepository
  - apps/mobile/lib/features/auth/login_screen.dart
  - apps/mobile/lib/features/push/push_registrar.dart#PushRegistrar
  - apps/mobile/lib/features/push/push_messaging.dart#PushMessaging
  - apps/mobile/lib/features/tickets/tickets_repository.dart#TicketsRepository
  - apps/mobile/lib/features/tickets/tickets_controller.dart#TicketsController
  - apps/mobile/lib/features/tickets/tickets_screen.dart
  - apps/mobile/lib/features/tickets/ticket_detail_screen.dart
  - apps/mobile/lib/features/status/status_screen.dart
  - apps/mobile/pubspec.yaml
  - apps/mobile/analysis_options.yaml
guards:
  - apps/mobile/test/api_client_test.dart
  - apps/mobile/test/auth_test.dart
  - apps/mobile/test/tickets_test.dart
  - apps/mobile/test/push_registrar_test.dart
  - apps/mobile/test/app_test.dart
  - script:mobile:test
  - script:verify:mobile
examples:
  - useRootNavigator
  - FutureProvider
  - StateNotifier
  - go_router
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

- `lib/core/`: `ApiClient` (the one HTTP entry point and the holder of the session), `ApiException` (the error
  envelope), `AppConfig` (`--dart-define` values), `json.dart` (the coercion helpers) and `CursorPage` (the list
  envelope).
- `lib/features/auth/`: email and password sign-in, with the workspace picker for a 409
  `WORKSPACE_SELECTION_REQUIRED`; `AuthController` holds the auth state the root widget switches on.
- `lib/features/push/`: `PushRegistrar` registers the device at `POST /notifications/devices` after sign-in and
  removes it at sign-out; `PushMessaging` is the seam over Firebase Cloud Messaging. Push is off until the four
  `FIREBASE_*` values are passed (`apps/mobile/README.md`).
- `lib/features/tickets/`: the example to copy. A cursor list (`TicketsController`, `TicketsScreen`) and a detail
  screen over `GET /support/tickets` and `GET /support/tickets/:id`.
- `lib/features/status/` (backend health), `lib/features/account/` (who is signed in, sign out) and
  `lib/widgets/async_view.dart` (`AsyncView`, `EmptyState`, `SkeletonList`).

Its dependencies beyond Flutter are `http`, `flutter_secure_storage`, `firebase_core` and `firebase_messaging`. State
is plain `ChangeNotifier` controllers and navigation is the stock `Navigator`: there is no state library and no
router yet. The rules marked "when you add" describe code that does not exist yet.

## Rules

### Layers and code quality

- `flutter analyze` is clean and `flutter test` is green before every commit (`pnpm mobile:test`); `pnpm verify`
  runs both as its `mobile` step. [guard: script:verify:mobile]
- Layers point one way: widget → state (a controller) → repository → `ApiClient`. A widget never calls the HTTP
  client, parses JSON or holds business logic in `build`. [review-only: no Dart spec reads imports]
- A feature is a folder under `lib/features/<area>/` with its repository, its state and its screens; a widget two
  features share goes in `lib/widgets/`. [review-only: needs reading]
- Every controller and subscription is disposed; after every `await`, check `if (!mounted) return;` before touching
  `context` or `setState`. A controller that notifies after an `await` guards against its own disposal, the way
  `TicketsController` does. [review-only: the analyzer catches some, not all]
- When you add libraries, keep to one set: Riverpod for state (auto-disposing `FutureProvider` for reads, repository
  providers, a `StateNotifier` for a rich flow), Dio once you outgrow `http`, `go_router` with an auth-gated
  redirect. Never mix paradigms: moving to Riverpod means moving every controller. [review-only: needs judgement]

### Models

- A model is a plain immutable class with a `const` constructor and named parameters. `fromJson` coerces every field
  through the one shared set of helpers in `lib/core/json.dart` (`jsonStr`, `jsonInt`, `jsonDouble`, `jsonNum`,
  `jsonDate`, `jsonMap`, `jsonList`), never a hard cast: a cast throws on an unexpected type and blanks the whole
  screen. [guard: apps/mobile/test/tickets_test.dart]
- Parse only the fields the UI uses; derived display logic is a getter on the model, not code in a widget.
  [review-only: needs reading]
- A list that can grow is read as a `CursorPage`: send the last page's `nextCursor` back as `cursor`, stop when it is
  null. Never an offset or a page number. [guard: apps/mobile/test/tickets_test.dart]

### The API client and the session

- `lib/core/api_client.dart` is the one HTTP entry point. An error answer is one envelope: `ApiException` carries
  `detail` as its message, `code` and `fieldErrors`; there is no `message` key, and a screen never sees a raw
  transport exception. [guard: apps/mobile/test/api_client_test.dart]
- Every request has a hard timeout (20 s). A request with no timeout is the "stuck skeleton" bug. A timeout and a
  dropped connection become an `ApiException` with `isOffline`. [guard: apps/mobile/test/api_client_test.dart]
- The session follows the web's rules. Sign-in goes through `ApiClient.startSession`, which keeps the access token
  from the body and the refresh token from the `refreshToken` cookie, both in `flutter_secure_storage`. A 401 on a
  signed-in request refreshes once (`POST /auth/refresh` with the cookie; the answer rotates the refresh token) and
  retries the request once. Concurrent 401s share one refresh: presenting a refresh token twice revokes the session.
  [guard: apps/mobile/test/api_client_test.dart]
- A refresh the server refuses clears the session and calls `onAuthExpired`, which `AuthController` turns into the
  sign-in screen, never a stranded error card. A refresh that could not reach the server keeps the session.
  [guard: apps/mobile/test/api_client_test.dart, apps/mobile/test/app_test.dart]
- Base URLs come from `AppConfig`, never a literal in feature code. [review-only: needs reading]

### Screens and feedback

- Every async surface renders its states through `AsyncView`: loading as a shaped skeleton, error as the envelope's
  copy with Try again (never an endless skeleton), and empty as an `EmptyState` with an icon, a title and a line.
  [guard: apps/mobile/test/app_test.dart]
- A list that already shows rows keeps them when a refresh fails and says so in a `SnackBar`; a list screen refreshes
  with `RefreshIndicator`. [review-only: needs reading]
- Every mutation shows a success and an error `SnackBar`; a busy button shows progress inside itself, never a
  blocking overlay. [review-only: needs reading]

### Push

- Notification permission is asked after sign-in, not at cold boot. The device token goes to
  `POST /notifications/devices` after sign-in and on every token change, and is removed with `DELETE` before
  sign-out, while the session can still authorize it. A failed registration never blocks the app.
  [guard: apps/mobile/test/push_registrar_test.dart]
- `firebase_messaging` stays on 16.x while the backend takes an FCM registration token: 17 moves to installation
  ids. [review-only: a version pin]

### Theme, routing and native

- The theme is built from the web tokens in `packages/ui/src/styles/globals.css` and exposed through a
  `ThemeExtension`; status colours live in one theme file mirroring the web's tones; light and dark both work. No hex
  in a widget: use `Theme.of(context).colorScheme`. The `ThemeData` still seeds from one hex colour in
  `lib/main.dart`; replace it when the theme file lands. [review-only: no Dart spec scans colours]
- The root `MaterialApp` is keyed by the auth state, so a sign-out or an ended session drops every pushed screen. A
  full-screen detail route is pushed on the root navigator, and a bottom sheet opened from inside the tab shell uses
  `useRootNavigator: true`, or floating chrome draws over it. [guard: apps/mobile/test/app_test.dart]
- Routing (when you add `go_router`): an auth-gated redirect, tabs under a shell route, detail routes at the top
  level, custom-scheme deep links that mirror the in-app routes. [review-only: not built yet]
- Native work: camera and library through `image_picker` with the usage strings in `Info.plist`; anything not built
  natively opens in the browser (`url_launcher`) rather than as a broken stub. [review-only: not built yet]

## Recipe: add a screen

Copy `lib/features/tickets/`.

1. Add `lib/features/<area>/` with a model (`fromJson` through the shared JSON helpers) and a repository that wraps
   `ApiClient` (`TicketsRepository`).
2. Add the state: a `ChangeNotifier` controller that calls the repository (`TicketsController` for a cursor list), and
   load it again after a write.
3. Add the screen: `AsyncView` for the states, a `SnackBar` for each write's outcome, theme colours only. Add its tab
   to the shell in `lib/main.dart`.
4. Add a test under `apps/mobile/test/` with `apiAnswering` from `test/helpers.dart`, the way `tickets_test.dart` and
   `app_test.dart` do.
5. Run `pnpm mobile:test`.

## Flag in review

- An endpoint called that the backend does not have, or business logic re-done in Dart.
- A hard cast in `fromJson`, or JSON helpers declared per model.
- HTTP, parsing or logic inside `build`.
- A sign-in that keeps its own token instead of going through `ApiClient.startSession`.
- A request that bypasses `ApiClient` (no timeout, no refresh), or a sheet from a tab shell without the root navigator.
- A hex colour in a widget.
- `flutter analyze` warnings in the diff.
