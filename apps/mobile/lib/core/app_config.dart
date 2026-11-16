/// Environment configuration for the mobile companion app.
///
/// Override at build/run time with --dart-define, e.g.
///   flutter run --dart-define=API_BASE_URL=https://api.yourapp.com/api/v1
class AppConfig {
  static const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:8000/api/v1');

  static const appName = String.fromEnvironment('APP_NAME', defaultValue: 'Platform');

  // Push is off until all four are set (see the README). The app id differs per platform, so pass the Android
  // one to an Android build and the iOS one to an iOS build.
  static const firebaseApiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const firebaseAppId = String.fromEnvironment('FIREBASE_APP_ID');
  static const firebaseMessagingSenderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  static const firebaseProjectId = String.fromEnvironment('FIREBASE_PROJECT_ID');

  static bool get pushConfigured =>
      firebaseApiKey.isNotEmpty &&
      firebaseAppId.isNotEmpty &&
      firebaseMessagingSenderId.isNotEmpty &&
      firebaseProjectId.isNotEmpty;
}
