import 'package:flutter/material.dart';

import '../../core/app_config.dart';
import '../auth/auth_controller.dart';

/// Who is signed in, which API this build talks to, and sign out.
class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key, required this.auth, required this.onSignOut});

  final AuthController auth;

  /// Deregisters push, then signs out.
  final Future<void> Function() onSignOut;

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  bool _busy = false;

  Future<void> _signOut() async {
    setState(() => _busy = true);
    try {
      await widget.onSignOut();
      // Signed out: the root widget has swapped this screen out.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.auth.user;
    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (user != null) ...[
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.person_outline),
              title: Text(user.displayName),
              subtitle: Text(user.email),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.apartment_outlined),
              title: Text(user.workspaceName),
              subtitle: Text(user.role),
            ),
          ],
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.dns_outlined),
            title: const Text('API'),
            subtitle: const Text(AppConfig.apiBaseUrl),
          ),
          const SizedBox(height: 16),
          FilledButton.tonal(
            onPressed: _busy ? null : _signOut,
            child: _busy
                ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Sign out'),
          ),
        ],
      ),
    );
  }
}
