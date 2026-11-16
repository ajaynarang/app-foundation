import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../status/status_screen.dart';
import 'auth_controller.dart';
import 'auth_repository.dart';
import 'session_user.dart';

/// Email and password sign-in (`POST /auth/login`), the foundation's primary method.
///
/// The backend also has phone OTP (`/auth/phone/send-otp`, `/auth/phone/verify-otp`) and Firebase exchange
/// (`/auth/firebase/exchange`). Each answers the same session, so a screen for one of them signs in through
/// `ApiClient.startSession` the same way.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.auth, required this.api});

  final AuthController auth;
  final ApiClient api;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;
  Map<String, String> _fieldErrors = const {};

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _signIn({String? tenantId}) async {
    setState(() {
      _busy = true;
      _error = null;
      _fieldErrors = const {};
    });
    try {
      await widget.auth.signIn(_email.text.trim(), _password.text, tenantId: tenantId);
      // Signed in: the root widget swaps this screen out.
    } on ApiException catch (e) {
      if (!mounted) return;
      final choices = AuthRepository.workspaceChoices(e);
      if (choices.isNotEmpty) {
        setState(() => _busy = false);
        final chosen = await _chooseWorkspace(choices);
        if (chosen != null && mounted) await _signIn(tenantId: chosen.tenantId);
        return;
      }
      setState(() {
        _error = e.message;
        _fieldErrors = e.fieldErrors;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<WorkspaceChoice?> _chooseWorkspace(List<WorkspaceChoice> choices) {
    return showModalBottomSheet<WorkspaceChoice>(
      context: context,
      useRootNavigator: true,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            ListTile(title: Text('Choose a workspace', style: Theme.of(context).textTheme.titleMedium)),
            for (final w in choices)
              ListTile(
                leading: const Icon(Icons.apartment_outlined),
                title: Text(w.name),
                onTap: () => Navigator.of(context).pop(w),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 380),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Welcome back', style: theme.textTheme.headlineSmall),
                    const SizedBox(height: 4),
                    Text('Sign in with your email and password', style: theme.textTheme.bodyMedium),
                    const SizedBox(height: 24),
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      autocorrect: false,
                      autofillHints: const [AutofillHints.username, AutofillHints.email],
                      decoration: InputDecoration(
                        labelText: 'Email',
                        border: const OutlineInputBorder(),
                        errorText: _fieldErrors['email'],
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _password,
                      obscureText: true,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.password],
                      onSubmitted: (_) => _busy ? null : _signIn(),
                      decoration: InputDecoration(
                        labelText: 'Password',
                        border: const OutlineInputBorder(),
                        errorText: _fieldErrors['password'],
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
                    ],
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _busy ? null : _signIn,
                      child: _busy
                          ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Sign in'),
                    ),
                    TextButton(
                      onPressed: () => Navigator.of(
                        context,
                      ).push(MaterialPageRoute<void>(builder: (_) => StatusScreen(api: widget.api))),
                      child: const Text('Check the connection'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
