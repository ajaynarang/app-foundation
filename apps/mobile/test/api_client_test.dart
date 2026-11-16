import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:app_mobile/core/api_client.dart';

import 'helpers.dart';

ApiClient clientAnswering(int status, Object? body, {String? reasonPhrase}) {
  return ApiClient(
    inner: MockClient(
      (_) async => http.Response(
        body is String ? body : jsonEncode(body),
        status,
        reasonPhrase: reasonPhrase,
        headers: {'content-type': 'application/json'},
      ),
    ),
  );
}

Future<ApiException> failureOf(ApiClient client) async {
  try {
    await client.get('/things');
  } on ApiException catch (e) {
    return e;
  }
  fail('expected an ApiException');
}

void main() {
  test('reads the error envelope: detail, code and fieldErrors', () async {
    final e = await failureOf(
      clientAnswering(400, {
        'statusCode': 400,
        'code': 'VALIDATION_FAILED',
        'detail': 'email must be an email',
        'fieldErrors': {'email': 'email must be an email'},
        'timestamp': '2026-11-12T00:00:00.000Z',
        'path': '/api/v1/things',
        'method': 'GET',
      }),
    );
    expect(e.statusCode, 400);
    expect(e.message, 'email must be an email');
    expect(e.code, 'VALIDATION_FAILED');
    expect(e.fieldErrors, {'email': 'email must be an email'});
  });

  test('does not read a message key: the envelope has none', () async {
    final e = await failureOf(
      clientAnswering(401, {'statusCode': 401, 'message': 'legacy copy'}, reasonPhrase: 'Unauthorized'),
    );
    expect(e.message, 'Unauthorized');
    expect(e.code, isNull);
    expect(e.fieldErrors, isEmpty);
  });

  test('a body that is not the envelope falls back to the reason phrase', () async {
    final e = await failureOf(clientAnswering(502, '', reasonPhrase: 'Bad Gateway'));
    expect(e.statusCode, 502);
    expect(e.message, 'Bad Gateway');
  });

  group('session', () {
    const storage = FlutterSecureStorage();
    setUp(() => FlutterSecureStorage.setMockInitialValues({}));

    Future<http.Response> login(http.Request _) async =>
        jsonResponse(200, {'accessToken': 'access-1', 'user': userJson}, refreshCookie: 'refresh-1');

    test('sign-in keeps the access token and the refresh cookie, and sends the bearer after', () async {
      String? bearer;
      final api = apiAnswering((r) async {
        if (r.url.path.endsWith('/auth/login')) return login(r);
        bearer = r.headers['Authorization'];
        return jsonResponse(200, {});
      });
      await api.startSession('/auth/login', body: {'email': 'a@b.c', 'password': 'x'});
      await api.get('/things');

      expect(bearer, 'Bearer access-1');
      expect(await storage.read(key: 'accessToken'), 'access-1');
      expect(await storage.read(key: 'refreshToken'), 'refresh-1');
    });

    test('a 401 refreshes with the cookie, stores the rotated pair and retries once', () async {
      final log = <String>[];
      String? cookieSent;
      final api = apiAnswering((r) async {
        if (r.url.path.endsWith('/auth/login')) return login(r);
        if (r.url.path.endsWith('/auth/refresh')) {
          cookieSent = r.headers['Cookie'];
          return jsonResponse(200, {'accessToken': 'access-2', 'user': userJson}, refreshCookie: 'refresh-2');
        }
        return r.headers['Authorization'] == 'Bearer access-2'
            ? jsonResponse(200, {'ok': true})
            : jsonResponse(401, {'statusCode': 401, 'code': 'UNAUTHORIZED', 'detail': 'Unauthorized'});
      }, log: log);
      await api.startSession('/auth/login', body: {});

      expect(await api.get('/things'), {'ok': true});
      expect(log, ['POST /auth/login', 'GET /things', 'POST /auth/refresh', 'GET /things']);
      expect(cookieSent, 'refreshToken=refresh-1');
      expect(await storage.read(key: 'accessToken'), 'access-2');
      expect(await storage.read(key: 'refreshToken'), 'refresh-2');
    });

    test('a refused refresh ends the session and calls onAuthExpired', () async {
      var expired = 0;
      final api = apiAnswering((r) async {
        if (r.url.path.endsWith('/auth/login')) return login(r);
        return jsonResponse(401, {'statusCode': 401, 'detail': 'Unauthorized'});
      })..onAuthExpired = () => expired++;
      await api.startSession('/auth/login', body: {});

      final e = await failureOf(api);
      expect(e.code, 'SESSION_EXPIRED');
      expect(e.isAuth, isTrue);
      expect(expired, 1);
      expect(api.hasSession, isFalse);
      expect(await storage.read(key: 'refreshToken'), isNull);
    });

    test('a refresh that cannot reach the server keeps the session', () async {
      var expired = 0;
      final api = apiAnswering((r) async {
        if (r.url.path.endsWith('/auth/login')) return login(r);
        if (r.url.path.endsWith('/auth/refresh')) {
          throw http.ClientException('offline');
        }
        return jsonResponse(401, {'statusCode': 401, 'detail': 'Unauthorized'});
      })..onAuthExpired = () => expired++;
      await api.startSession('/auth/login', body: {});

      final e = await failureOf(api);
      expect(e.isOffline, isTrue);
      expect(expired, 0);
      expect(await storage.read(key: 'refreshToken'), 'refresh-1');
    });

    test('concurrent 401s share one refresh', () async {
      final log = <String>[];
      final api = apiAnswering((r) async {
        if (r.url.path.endsWith('/auth/login')) return login(r);
        if (r.url.path.endsWith('/auth/refresh')) {
          return jsonResponse(200, {'accessToken': 'access-2'}, refreshCookie: 'refresh-2');
        }
        return r.headers['Authorization'] == 'Bearer access-2'
            ? jsonResponse(200, {})
            : jsonResponse(401, {'statusCode': 401, 'detail': 'Unauthorized'});
      }, log: log);
      await api.startSession('/auth/login', body: {});

      await Future.wait([api.get('/a'), api.get('/b'), api.get('/c')]);
      expect(log.where((l) => l == 'POST /auth/refresh'), hasLength(1));
    });

    test('the live cookie is the last one when a legacy cookie is expired first', () async {
      final api = apiAnswering(
        (_) async => http.Response(
          jsonEncode({'accessToken': 'access-1'}),
          200,
          headers: {
            'set-cookie':
                'refreshToken=; Domain=.example.com; Expires=Thu, 01 Jan 1970 00:00:00 GMT,'
                'refreshToken=refresh-9; Path=/; HttpOnly',
          },
        ),
      );
      await api.startSession('/auth/login', body: {});
      expect(await storage.read(key: 'refreshToken'), 'refresh-9');
    });

    test('a stored session is restored at boot', () async {
      FlutterSecureStorage.setMockInitialValues({'accessToken': 'access-7', 'refreshToken': 'refresh-7'});
      String? bearer;
      final api = apiAnswering((r) async {
        bearer = r.headers['Authorization'];
        return jsonResponse(200, {});
      });
      expect(api.hasSession, isFalse);
      await api.restoreSession();
      await api.get('/things');
      expect(bearer, 'Bearer access-7');
    });
  });

  test('a request that hangs fails at the timeout, as copy a screen can show', () async {
    final api = apiAnswering(
      (_) => Future.delayed(const Duration(seconds: 1), () => jsonResponse(200, {})),
      timeout: const Duration(milliseconds: 20),
    );
    final e = await failureOf(api);
    expect(e.isTimeout, isTrue);
    expect(e.isOffline, isTrue);
    expect(e.message, isNotEmpty);
  });

  test('any transport failure, a TLS handshake included, becomes an ApiException', () async {
    final e = await failureOf(apiAnswering((_) async => throw Exception('HandshakeException')));
    expect(e.isOffline, isTrue);
    expect(e.code, 'NETWORK');
  });

  test('an error body that is not JSON still becomes an ApiException', () async {
    final e = await failureOf(clientAnswering(502, '<html>Bad Gateway</html>', reasonPhrase: 'Bad Gateway'));
    expect(e.statusCode, 502);
    expect(e.message, 'Bad Gateway');
  });
}
