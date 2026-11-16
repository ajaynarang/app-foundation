import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:app_mobile/core/api_client.dart';
import 'package:app_mobile/features/push/push_messaging.dart';

/// A JSON answer. `refreshCookie` adds the Set-Cookie the API sends with a new session.
http.Response jsonResponse(int status, Object? body, {String? refreshCookie, String? reasonPhrase}) {
  return http.Response(
    body == null ? '' : jsonEncode(body),
    status,
    reasonPhrase: reasonPhrase,
    headers: {
      'content-type': 'application/json',
      if (refreshCookie != null) 'set-cookie': 'refreshToken=$refreshCookie; Path=/; HttpOnly; SameSite=Lax',
    },
  );
}

/// An [ApiClient] whose every request goes to [handler]; [log] records `METHOD /path` in order.
ApiClient apiAnswering(
  Future<http.Response> Function(http.Request request) handler, {
  List<String>? log,
  Duration? timeout,
}) {
  final inner = MockClient((request) {
    log?.add('${request.method} ${request.url.path.replaceFirst('/api/v1', '')}');
    return handler(request);
  });
  return timeout == null ? ApiClient(inner: inner) : ApiClient(inner: inner, timeout: timeout);
}

const userJson = {
  'userId': 'usr_1',
  'email': 'owner@example.com',
  'firstName': 'Olive',
  'lastName': 'Owner',
  'role': 'OWNER',
  'tenantName': 'Acme',
};

Map<String, Object?> ticketJson(int id, {String status = 'OPEN', List<Object?>? messages}) => {
  'id': id,
  'ticketNumber': 'ST-$id',
  'subject': 'Ticket $id',
  'description': 'Description $id',
  'status': status,
  'messageCount': messages?.length ?? 0,
  'createdAt': '2026-11-12T00:00:00.000Z',
  if (messages != null) 'messages': messages,
};

class FakeMessaging implements PushMessaging {
  FakeMessaging({this.allowed = true, this.token = 'token-1'});

  final bool allowed;
  String? token;
  final refreshed = StreamController<String>.broadcast();

  @override
  Future<bool> requestPermission() async => allowed;

  @override
  Future<String?> getToken() async => token;

  @override
  Stream<String> get onTokenRefresh => refreshed.stream;

  @override
  Future<void> deleteToken() async => token = null;
}
