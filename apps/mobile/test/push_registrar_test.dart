import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app_mobile/features/push/push_messaging.dart';
import 'package:app_mobile/features/push/push_registrar.dart';

import 'helpers.dart';

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
}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('registers the device, registers again when the token changes, and deregisters at sign-out', () async {
    final calls = <String>[];
    final api = apiAnswering((r) async {
      calls.add('${r.method} ${jsonEncode(jsonDecode(r.body))}');
      return jsonResponse(204, null);
    });
    final messaging = FakeMessaging();
    final registrar = PushRegistrar(api, messaging, platform: 'ios');

    await registrar.start();
    messaging
      ..token = 'token-2'
      ..refreshed.add('token-2');
    await pumpEventQueue();
    await registrar.stop();
    messaging.refreshed.add('token-3');
    await pumpEventQueue();

    expect(calls, [
      'POST {"token":"token-1","platform":"ios"}',
      'POST {"token":"token-2","platform":"ios"}',
      'DELETE {"token":"token-2"}',
    ]);
  });

  test('does nothing when notifications are refused', () async {
    final log = <String>[];
    final registrar = PushRegistrar(
      apiAnswering((_) async => jsonResponse(204, null), log: log),
      FakeMessaging(allowed: false),
    );
    await registrar.start();
    expect(log, isEmpty);
  });

  test('a failed registration never throws into the app', () async {
    final registrar = PushRegistrar(
      apiAnswering((_) async => jsonResponse(403, {'statusCode': 403, 'code': 'FORBIDDEN', 'detail': 'Forbidden'})),
      FakeMessaging(),
    );
    await registrar.start();
    await registrar.stop();
  });
}
