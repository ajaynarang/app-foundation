import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'app_config.dart';
import 'json.dart';

/// The one HTTP entry point for the backend, and the holder of the session.
///
/// The session follows the web's rules. Sign-in answers an access token in the body and a refresh token in the
/// `refreshToken` cookie. A 401 on a signed-in request trades the refresh token for a new pair once
/// (`POST /auth/refresh`, which rotates the refresh token) and retries the request once. A refresh the server
/// refuses ends the session and calls [onAuthExpired]. Both tokens live in the Keychain / Keystore, so the session
/// survives a restart. Every request has a hard timeout.
class ApiClient {
  ApiClient({http.Client? inner, FlutterSecureStorage? storage, this.timeout = const Duration(seconds: 20)})
    : _inner = inner ?? http.Client(),
      _storage = storage ?? const FlutterSecureStorage();

  static const _accessKey = 'accessToken';
  // Also the name of the API's refresh cookie (REFRESH_TOKEN_COOKIE_NAME).
  static const _refreshKey = 'refreshToken';
  static final _refreshCookie = RegExp('$_refreshKey=([^;,\\s]+)');

  final http.Client _inner;
  final FlutterSecureStorage _storage;
  final Duration timeout;

  /// Called once the server has refused to refresh the session. Wire it to the auth state so the app shows sign-in.
  void Function()? onAuthExpired;

  String? _accessToken;
  String? _refreshToken;
  Future<bool>? _refreshing;

  bool get hasSession => _accessToken != null || _refreshToken != null;

  /// Loads the stored session at boot.
  Future<void> restoreSession() async {
    _accessToken = await _storage.read(key: _accessKey);
    _refreshToken = await _storage.read(key: _refreshKey);
  }

  Future<void> clearSession() async {
    _accessToken = null;
    _refreshToken = null;
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }

  /// Signs in through an endpoint that answers `{ accessToken, user }` and sets the refresh cookie
  /// (`/auth/login`, `/auth/phone/verify-otp`, `/auth/firebase/exchange`), and keeps the session.
  Future<Map<String, dynamic>> startSession(String path, {required Object body}) async =>
      _keepSession(await _send('POST', path, body: body));

  Future<Map<String, dynamic>> get(String path, {Map<String, String>? query}) => _request('GET', path, query: query);

  Future<Map<String, dynamic>> post(String path, {Object? body}) => _request('POST', path, body: body ?? const {});

  Future<Map<String, dynamic>> patch(String path, {Object? body}) => _request('PATCH', path, body: body ?? const {});

  Future<Map<String, dynamic>> delete(String path, {Object? body}) => _request('DELETE', path, body: body);

  Future<Map<String, dynamic>> _request(String method, String path, {Object? body, Map<String, String>? query}) async {
    for (var attempt = 0; ; attempt++) {
      final sent = _accessToken;
      final res = await _send(
        method,
        path,
        body: body,
        query: query,
        headers: {if (sent != null) 'Authorization': 'Bearer $sent'},
      );
      // A 401 with no session is a plain error (a wrong password, a protected route): nothing to refresh.
      if (res.statusCode != 401 || attempt > 0 || !hasSession) return _decode(res);
      // Another request refreshed while this one was in flight: retry with its token, do not rotate again.
      if (_accessToken != null && _accessToken != sent) continue;
      if (!await _refresh()) {
        await clearSession();
        onAuthExpired?.call();
        throw ApiException(401, 'Your session has ended. Sign in again.', code: 'SESSION_EXPIRED');
      }
    }
  }

  /// True when the session was refreshed, false when the server refused. Throws when the server could not be
  /// reached or failed: that is not a reason to sign the person out. Concurrent 401s share one refresh, because
  /// presenting a refresh token twice reads as theft and revokes the session.
  Future<bool> _refresh() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<bool> _doRefresh() async {
    final token = _refreshToken;
    if (token == null) return false;
    final res = await _send('POST', '/auth/refresh', headers: {'Cookie': '$_refreshKey=$token'});
    if (res.statusCode == 401 || res.statusCode == 403) return false;
    await _keepSession(res);
    return true;
  }

  Future<Map<String, dynamic>> _keepSession(http.Response res) async {
    final body = _decode(res);
    final access = jsonStr(body['accessToken']);
    if (access.isEmpty) {
      throw ApiException(res.statusCode, 'The server sent no access token.');
    }
    _accessToken = access;
    await _storage.write(key: _accessKey, value: access);
    // Several Set-Cookie headers arrive joined; the last non-empty value is the live cookie (an earlier one may
    // be the expiry of a legacy cookie).
    final cookies = _refreshCookie.allMatches(res.headers['set-cookie'] ?? '');
    if (cookies.isNotEmpty) {
      _refreshToken = cookies.last.group(1);
      await _storage.write(key: _refreshKey, value: _refreshToken);
    }
    return body;
  }

  Future<http.Response> _send(
    String method,
    String path, {
    Object? body,
    Map<String, String>? query,
    Map<String, String> headers = const {},
  }) async {
    final uri = Uri.parse('${AppConfig.apiBaseUrl}$path');
    final req = http.Request(method, query == null ? uri : uri.replace(queryParameters: query))
      ..headers.addAll(headers);
    if (body != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(body);
    }
    try {
      return await _inner.send(req).then(http.Response.fromStream).timeout(timeout);
    } on TimeoutException {
      throw ApiException(0, 'The server took too long to answer. Try again.', code: 'TIMEOUT');
    } catch (_) {
      // Not only http.ClientException: a TLS failure (captive portal, wrong device clock) arrives as a raw
      // HandshakeException. Callers catch ApiException only, so nothing else may leave this method.
      throw ApiException(0, 'Cannot reach the server. Check your connection.', code: 'NETWORK');
    }
  }

  Map<String, dynamic> _decode(http.Response res) {
    Object? decoded;
    try {
      decoded = res.body.isEmpty ? null : jsonDecode(res.body);
    } on FormatException {
      decoded = null; // a proxy's HTML error page, not the API's JSON
    }
    final json = jsonMap(decoded);
    if (res.statusCode >= 400) {
      // Every API error is one envelope: `detail` is the copy to show, `code` is the machine code.
      // There is no `message` key.
      final detail = json['detail'];
      final code = json['code'];
      final fieldErrors = json['fieldErrors'];
      throw ApiException(
        res.statusCode,
        detail is String && detail.isNotEmpty ? detail : (res.reasonPhrase ?? 'Request failed'),
        code: code is String ? code : null,
        fieldErrors: fieldErrors is Map
            ? fieldErrors.map((key, value) => MapEntry(key.toString(), value.toString()))
            : const <String, String>{},
        envelope: json,
      );
    }
    return json;
  }
}

class ApiException implements Exception {
  ApiException(
    this.statusCode,
    this.message, {
    this.code,
    this.fieldErrors = const <String, String>{},
    this.envelope = const <String, dynamic>{},
  });

  /// The HTTP status, or 0 when no answer arrived (timeout, no network).
  final int statusCode;

  /// The envelope's `detail`: copy that is safe to show.
  final String message;

  /// The envelope's machine `code` (`VALIDATION_FAILED`, `NOT_FOUND`, a domain code, …).
  final String? code;

  /// Only on a 400: field name to message.
  final Map<String, String> fieldErrors;

  /// The whole error body, for the few codes that carry more (`WORKSPACE_SELECTION_REQUIRED` has `workspaces`).
  final Map<String, dynamic> envelope;

  bool get isAuth => statusCode == 401;
  bool get isTimeout => code == 'TIMEOUT';

  /// No answer arrived at all: the session, and whatever is on screen, should be kept.
  bool get isOffline => statusCode == 0;

  @override
  String toString() => 'ApiException($statusCode): $message';
}
