import 'package:flutter/foundation.dart';

import '../../core/api_client.dart';
import 'auth_repository.dart';
import 'session_user.dart';

enum AuthStatus { unknown, signedOut, signedIn }

/// The app's auth state. The root widget listens to it and shows splash, sign-in or the app.
class AuthController extends ChangeNotifier {
  AuthController(this._api, this._repository) {
    _api.onAuthExpired = sessionExpired;
  }

  final ApiClient _api;
  final AuthRepository _repository;

  AuthStatus status = AuthStatus.unknown;

  /// Null while signed out, and when the app started offline with a stored session.
  SessionUser? user;

  /// At boot: a stored session is checked with `GET /auth/me` (which refreshes it when the access token is old).
  Future<void> restore() async {
    await _api.restoreSession();
    if (!_api.hasSession) return _set(AuthStatus.signedOut);
    try {
      user = await _repository.me();
    } on ApiException {
      // Refused: sessionExpired() has already signed out. Offline or a server error: keep the session, each
      // screen shows its own Try again.
    }
    if (status == AuthStatus.unknown) _set(AuthStatus.signedIn);
  }

  /// Throws [ApiException]; the sign-in screen shows it.
  Future<void> signIn(String email, String password, {String? tenantId}) async {
    user = await _repository.login(email, password, tenantId: tenantId);
    _set(AuthStatus.signedIn);
  }

  Future<void> signOut() async {
    try {
      await _repository.logout();
    } on ApiException {
      // Signing out of this device must work offline; the refresh token then expires on its own.
    }
    await _api.clearSession();
    sessionExpired();
  }

  /// The server ended the session ([ApiClient.onAuthExpired]): back to sign-in.
  void sessionExpired() {
    user = null;
    _set(AuthStatus.signedOut);
  }

  void _set(AuthStatus next) {
    status = next;
    notifyListeners();
  }
}
