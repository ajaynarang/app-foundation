// The real app on a simulator or device, against a real backend: sign in, open a ticket, sign out.
// It proves what a widget test cannot: the Keychain / Keystore plugin, the network permissions and the native build.
//
//   flutter test integration_test -d <device id> --dart-define=API_BASE_URL=http://localhost:8000/api/v1
//
// Needs a running, seeded backend with at least one ticket for the seeded owner (test/live_api_test.dart makes one).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:app_mobile/main.dart' as app;

/// Pumps until [finder] matches. Network answers arrive in real time, and a still skeleton schedules no frame, so
/// `pumpAndSettle` alone would return too early.
Future<void> pumpUntil(WidgetTester tester, Finder finder) async {
  for (var i = 0; i < 150 && finder.evaluate().isEmpty; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
  expect(finder, findsWidgets);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('sign in, open a ticket, sign out', (tester) async {
    await app.main();
    await pumpUntil(tester, find.text('Welcome back'));

    await tester.enterText(find.widgetWithText(TextField, 'Email'), 'owner@example.com');
    await tester.enterText(find.widgetWithText(TextField, 'Password'), 'Password123!');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await pumpUntil(tester, find.text('Support tickets'));

    await pumpUntil(tester, find.byIcon(Icons.chevron_right));
    await tester.tap(find.byIcon(Icons.chevron_right).first);
    await pumpUntil(tester, find.byType(Chip));
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.text('Account'));
    await tester.pumpAndSettle();
    expect(find.text('owner@example.com'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
    await pumpUntil(tester, find.text('Welcome back'));
  });
}
