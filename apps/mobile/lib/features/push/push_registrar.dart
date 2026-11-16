import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api_client.dart';
import 'push_messaging.dart';

/// Keeps this device registered for push while someone is signed in:
/// `POST /notifications/devices` after sign-in and on every token change, `DELETE` at sign-out.
class PushRegistrar {
  PushRegistrar(this._api, this._messaging, {String? platform})
    : _platform = platform ?? (defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android');

  final ApiClient _api;
  final PushMessaging _messaging;
  final String _platform;

  StreamSubscription<String>? _tokens;

  /// Call once the person is signed in. Asks for permission; does nothing when it is refused.
  Future<void> start() async {
    if (!await _messaging.requestPermission()) return;
    await _tokens?.cancel();
    _tokens = _messaging.onTokenRefresh.listen(_register);
    final token = await _messaging.getToken();
    if (token != null) await _register(token);
  }

  /// Call before sign-out, while the session can still authorize the request. A session the server ended cannot
  /// deregister; the next sign-in on this device moves the token to that account.
  Future<void> stop() async {
    await _tokens?.cancel();
    _tokens = null;
    final token = await _messaging.getToken();
    if (token == null) return;
    try {
      await _api.delete('/notifications/devices', body: {'token': token});
    } on ApiException catch (e) {
      debugPrint('Could not deregister this device for push: ${e.message}');
    }
  }

  Future<void> _register(String token) async {
    try {
      await _api.post('/notifications/devices', body: {'token': token, 'platform': _platform});
    } on ApiException catch (e) {
      // Push is an extra: never block the app on it. The next sign-in or token change tries again.
      debugPrint('Could not register this device for push: ${e.message}');
    }
  }
}
