// The session and the example reads against a real backend: the one test that checks the app against the wire.
// Skipped unless asked for, because it needs a running, seeded backend and it creates a ticket:
//
//   flutter test test/live_api_test.dart --dart-define=LIVE_API_TEST=true \
//     --dart-define=API_BASE_URL=http://localhost:8000/api/v1
//
// LIVE_API_EMAIL and LIVE_API_PASSWORD default to the seeded owner.
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app_mobile/core/api_client.dart';
import 'package:app_mobile/features/auth/auth_repository.dart';
import 'package:app_mobile/features/tickets/tickets_repository.dart';

const live = bool.fromEnvironment('LIVE_API_TEST');
const email = String.fromEnvironment('LIVE_API_EMAIL', defaultValue: 'owner@example.com');
const password = String.fromEnvironment('LIVE_API_PASSWORD', defaultValue: 'Password123!');

void main() {
  test(
    'sign in, refresh with the rotated cookie, read tickets, register a device, sign out',
    () async {
      FlutterSecureStorage.setMockInitialValues({});
      const storage = FlutterSecureStorage();
      var expired = 0;
      final api = ApiClient()..onAuthExpired = () => expired++;
      final auth = AuthRepository(api);

      expect((await auth.login(email, password)).email, email);
      final firstRefreshToken = await storage.read(key: 'refreshToken');
      expect(firstRefreshToken, isNotNull, reason: 'the refresh cookie was not read from Set-Cookie');

      // An access token the server refuses: the next request must refresh with the cookie and retry.
      await storage.write(key: 'accessToken', value: 'not-a-token');
      await api.restoreSession();
      expect((await auth.me()).email, email);
      expect(await storage.read(key: 'refreshToken'), isNot(firstRefreshToken), reason: 'refresh must rotate');

      final subject = 'Live check ${DateTime.now().toIso8601String()}';
      final created = await api.post('/support/tickets', body: {'subject': subject, 'description': 'From the app.'});
      final tickets = TicketsRepository(api);
      final page = await tickets.list();
      final listed = page.items.firstWhere((t) => t.subject == subject);
      expect(listed.id, created['id']);
      expect(page.total, greaterThanOrEqualTo(1));
      final detail = await tickets.get(listed.id);
      expect(detail.description, 'From the app.');
      expect(detail.ticketNumber, listed.ticketNumber);

      // The error envelope, from a real 404 and a real 400.
      await expectLater(
        tickets.get(2147483000),
        throwsA(
          isA<ApiException>().having((e) => e.statusCode, 'statusCode', 404).having((e) => e.code, 'code', isNotNull),
        ),
      );
      await expectLater(
        api.post('/support/tickets', body: {'subject': ''}),
        throwsA(isA<ApiException>().having((e) => e.fieldErrors, 'fieldErrors', isNotEmpty)),
      );

      await api.post('/notifications/devices', body: {'token': 'live-check-device', 'platform': 'android'});
      await api.delete('/notifications/devices', body: {'token': 'live-check-device'});

      await auth.logout();
      // Signed out on the server: the refresh token it revoked can no longer start a session.
      await storage.write(key: 'accessToken', value: 'not-a-token');
      await api.restoreSession();
      await expectLater(auth.me(), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'SESSION_EXPIRED')));
      expect(expired, 1);
      expect(api.hasSession, isFalse);
    },
    skip: live ? false : 'needs a running backend: --dart-define=LIVE_API_TEST=true',
  );
}
