import 'package:flutter/material.dart';

import 'core/api_client.dart';
import 'core/app_config.dart';
import 'features/account/account_screen.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/auth_repository.dart';
import 'features/auth/login_screen.dart';
import 'features/push/push_messaging.dart';
import 'features/push/push_registrar.dart';
import 'features/status/status_screen.dart';
import 'features/tickets/tickets_repository.dart';
import 'features/tickets/tickets_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = ApiClient();
  final auth = AuthController(api, AuthRepository(api));
  final messaging = await FirebasePushMessaging.tryCreate();
  runApp(CompanionApp(api: api, auth: auth, push: messaging == null ? null : PushRegistrar(api, messaging)));
  await auth.restore();
}

/// Mobile companion for the AppShore foundation.
///
/// Ships sign-in with a session that refreshes, push registration, one example list and detail (support tickets),
/// the backend status screen and an account screen. Add your product screens under `lib/features/<area>/`.
class CompanionApp extends StatelessWidget {
  const CompanionApp({super.key, required this.api, required this.auth, this.push});

  final ApiClient api;
  final AuthController auth;

  /// Null when push is not configured for this build.
  final PushRegistrar? push;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: auth,
      builder: (context, _) => MaterialApp(
        // A new key per auth state rebuilds the navigator, so signing out (or an expired session) also drops
        // every screen pushed on top of the tabs.
        key: ValueKey(auth.status),
        title: AppConfig.appName,
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6366F1), brightness: Brightness.dark),
          useMaterial3: true,
        ),
        home: switch (auth.status) {
          AuthStatus.unknown => const Scaffold(body: Center(child: CircularProgressIndicator())),
          AuthStatus.signedOut => LoginScreen(auth: auth, api: api),
          AuthStatus.signedIn => _HomeShell(api: api, auth: auth, push: push),
        },
      ),
    );
  }
}

class _HomeShell extends StatefulWidget {
  const _HomeShell({required this.api, required this.auth, required this.push});

  final ApiClient api;
  final AuthController auth;
  final PushRegistrar? push;

  @override
  State<_HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<_HomeShell> {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    // Signed in: now is the time to ask for notifications and register the device.
    widget.push?.start();
  }

  Future<void> _signOut() async {
    await widget.push?.stop();
    await widget.auth.signOut();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [
          TicketsScreen(repository: TicketsRepository(widget.api)),
          StatusScreen(api: widget.api),
          AccountScreen(auth: widget.auth, onSignOut: _signOut),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) {
          setState(() => _tab = i);
          widget.auth.loadUserIfMissing();
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.confirmation_number_outlined), label: 'Tickets'),
          NavigationDestination(icon: Icon(Icons.monitor_heart_outlined), label: 'Status'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: 'Account'),
        ],
      ),
    );
  }
}
