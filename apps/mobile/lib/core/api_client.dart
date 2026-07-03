import 'dart:convert';

import 'package:http/http.dart' as http;

import 'app_config.dart';

/// Thin JSON API client for the AppShore backend.
///
/// Mirrors the web app's api client: base URL + bearer token + JSON codecs.
/// Extend with refresh-token handling when you wire real sessions.
class ApiClient {
  ApiClient({http.Client? inner}) : _inner = inner ?? http.Client();

  final http.Client _inner;
  String? _accessToken;

  set accessToken(String? token) => _accessToken = token;
  bool get isAuthenticated => _accessToken != null;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
      };

  Uri _uri(String path) => Uri.parse('${AppConfig.apiBaseUrl}$path');

  Future<Map<String, dynamic>> get(String path) async {
    final res = await _inner.get(_uri(path), headers: _headers);
    return _decode(res);
  }

  Future<Map<String, dynamic>> post(String path, {Object? body}) async {
    final res = await _inner.post(_uri(path), headers: _headers, body: jsonEncode(body ?? {}));
    return _decode(res);
  }

  Map<String, dynamic> _decode(http.Response res) {
    final Object? decoded = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode >= 400) {
      final message = decoded is Map<String, dynamic>
          ? (decoded['message']?.toString() ?? res.reasonPhrase)
          : res.reasonPhrase;
      throw ApiException(res.statusCode, message ?? 'Request failed');
    }
    return decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
  }
}

class ApiException implements Exception {
  ApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;

  @override
  String toString() => 'ApiException($statusCode): $message';
}
