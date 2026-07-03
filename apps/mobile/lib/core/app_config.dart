/// Environment configuration for the mobile companion app.
///
/// Override at build/run time with --dart-define, e.g.
///   flutter run --dart-define=API_BASE_URL=https://api.yourapp.com/api/v1
class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8000/api/v1',
  );

  static const appName = String.fromEnvironment(
    'APP_NAME',
    defaultValue: 'Platform',
  );
}
