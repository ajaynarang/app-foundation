import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:app_mobile/core/api_client.dart';

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
}
