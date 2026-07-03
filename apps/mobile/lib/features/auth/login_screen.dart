import 'package:flutter/material.dart';

import '../../core/api_client.dart';

/// Phone-OTP login scaffold, wired to the foundation's real endpoints:
///   POST /auth/phone/send-otp   { phone }
///   POST /auth/phone/verify-otp { phone, code }
///
/// The foundation also supports Firebase token exchange
/// (POST /auth/firebase/exchange) — swap this screen for your provider's
/// flow when you pick one.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.api, required this.onAuthenticated});

  final ApiClient api;
  final VoidCallback onAuthenticated;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  bool _otpSent = false;
  bool _busy = false;
  String? _error;

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendOtp() => _run(() async {
        await widget.api.post('/auth/phone/send-otp', body: {'phone': _phoneController.text.trim()});
        setState(() => _otpSent = true);
      });

  Future<void> _verifyOtp() => _run(() async {
        final res = await widget.api.post('/auth/phone/verify-otp', body: {
          'phone': _phoneController.text.trim(),
          'code': _codeController.text.trim(),
        });
        final token = res['accessToken'] as String?;
        if (token == null) {
          throw ApiException(500, 'No access token in response');
        }
        widget.api.accessToken = token;
        widget.onAuthenticated();
      });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sign in')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 380),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Welcome back', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 4),
                Text(
                  'Sign in with your phone number',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  enabled: !_otpSent,
                  decoration: const InputDecoration(
                    labelText: 'Phone number',
                    hintText: '+1 555 000 1234',
                    border: OutlineInputBorder(),
                  ),
                ),
                if (_otpSent) ...[
                  const SizedBox(height: 12),
                  TextField(
                    controller: _codeController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'One-time code',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _busy ? null : (_otpSent ? _verifyOtp : _sendOtp),
                  child: _busy
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(_otpSent ? 'Verify code' : 'Send code'),
                ),
                if (_otpSent)
                  TextButton(
                    onPressed: _busy ? null : () => setState(() => _otpSent = false),
                    child: const Text('Use a different number'),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
