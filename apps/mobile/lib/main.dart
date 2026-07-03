import 'package:flutter/material.dart';

import 'core/api_client.dart';
import 'core/app_config.dart';
import 'features/auth/login_screen.dart';
import 'features/status/status_screen.dart';

void main() {
  runApp(const CompanionApp());
}

/// Mobile companion for the AppShore foundation.
///
/// Ships two screens as your starting point:
///  - Platform status (backend /health) — works out of the box
///  - Sign-in scaffold (phone OTP endpoints)
/// Add your product screens under `lib/features/your-domain/`.
class CompanionApp extends StatefulWidget {
  const CompanionApp({super.key});

  @override
  State<CompanionApp> createState() => _CompanionAppState();
}

class _CompanionAppState extends State<CompanionApp> {
  final _api = ApiClient();
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF6366F1),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: Scaffold(
        body: IndexedStack(
          index: _tab,
          children: [
            StatusScreen(api: _api),
            LoginScreen(api: _api, onAuthenticated: () => setState(() => _tab = 0)),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) => setState(() => _tab = i),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.monitor_heart_outlined), label: 'Status'),
            NavigationDestination(icon: Icon(Icons.person_outline), label: 'Sign in'),
          ],
        ),
      ),
    );
  }
}
