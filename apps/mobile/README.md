# Mobile companion app

A Flutter client of the backend API. It changes nothing on the backend and holds no business logic.

## What is in it

| Area            | Where                                           | What it does                                                                                                                                                                              |
| --------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session         | `lib/core/api_client.dart`                      | One HTTP entry point. Keeps the access and refresh tokens in the Keychain / Keystore, refreshes once on a 401 and retries, and sends the app to sign-in when the server ends the session. |
| Sign-in         | `lib/features/auth/`                            | Email and password (`POST /auth/login`), with a workspace picker when the email belongs to several.                                                                                       |
| Push            | `lib/features/push/`                            | Registers the device with the backend after sign-in (`POST /notifications/devices`) and removes it at sign-out. Off until configured, see below.                                          |
| Example screens | `lib/features/tickets/`                         | A cursor list and a detail screen over the support tickets API. Copy this folder for your own screens.                                                                                    |
| Status, account | `lib/features/status/`, `lib/features/account/` | Backend health; who is signed in and sign out.                                                                                                                                            |

The rules for growing it are in `.claude/skills/app-conventions/references/mobile.md`.

## Run it

```bash
pnpm docker:up && pnpm dev      # the backend on :8000, from the repo root
pnpm mobile:dev                 # or: cd apps/mobile && flutter run
```

Sign in with a seeded account (`owner@example.com` / `Password123!`).

An Android emulator reaches your machine at `10.0.2.2`, not `localhost`:

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000/api/v1
```

## Configuration

Everything is a `--dart-define`, read in `lib/core/app_config.dart`.

| Define                                                                                       | Default                        | What it is                        |
| -------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------- |
| `API_BASE_URL`                                                                               | `http://localhost:8000/api/v1` | The backend.                      |
| `APP_NAME`                                                                                   | `Platform`                     | The app title.                    |
| `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_PROJECT_ID` | unset                          | Push. Off until all four are set. |

## Turn push on

Push goes through Firebase Cloud Messaging on both platforms (APNs through FCM on iOS). The backend sends through
the same Firebase project (`FIREBASE_*` in `apps/backend/.env.example`).

1. In the Firebase console, add an Android app and an iOS app to the project the backend uses. Use the app's bundle
   id and application id. Set your own first: the iOS bundle id (`PRODUCT_BUNDLE_IDENTIFIER` in
   `ios/Runner.xcodeproj`) is not renamed by `init-app`.
2. Pass the four values from each app's settings to its build. The app id differs per platform:

   ```bash
   flutter run \
     --dart-define=FIREBASE_API_KEY=... --dart-define=FIREBASE_APP_ID=... \
     --dart-define=FIREBASE_MESSAGING_SENDER_ID=... --dart-define=FIREBASE_PROJECT_ID=...
   ```

3. iOS only: upload an APNs key to the Firebase project, and in Xcode add the Push Notifications capability and the
   "Remote notifications" background mode to the Runner target. Push needs a real device; a simulator gets no token.

The app asks for notification permission after sign-in. A notification that arrives while the app is in the
background is shown by the OS. Routing a tap to a screen is yours to add: the message's `data` carries `type` and
`actionUrl`.

## Check it

```bash
pnpm verify:mobile              # flutter analyze && flutter test; also a step of pnpm verify
```

Two more checks need a running, seeded backend, so `pnpm verify` does not run them:

```bash
# The session, the example reads and the error envelope over the real wire (creates one ticket).
flutter test test/live_api_test.dart --dart-define=LIVE_API_TEST=true

# The real app on a simulator or device: sign in, open a ticket, sign out.
flutter test integration_test -d <device id>
```

Both take `--dart-define=API_BASE_URL=...` for a backend that is not on `localhost:8000`.
