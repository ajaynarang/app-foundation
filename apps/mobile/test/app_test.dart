import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:app_mobile/features/auth/auth_controller.dart';
import 'package:app_mobile/features/auth/auth_repository.dart';
import 'package:app_mobile/main.dart';

import 'helpers.dart';

/// The backend as the app sees it: sign-in, one ticket in the list, its detail.
Future<http.Response> backend(http.Request r) async {
  final path = r.url.path.replaceFirst('/api/v1', '');
  if (path == '/auth/login') {
    return r.body.contains('Password123!')
        ? jsonResponse(200, {'accessToken': 'a', 'user': userJson}, refreshCookie: 'r')
        : jsonResponse(401, {'statusCode': 401, 'code': 'UNAUTHORIZED', 'detail': 'Invalid email or password'});
  }
  if (path == '/support/tickets') {
    return jsonResponse(200, {
      'items': [ticketJson(4)],
      'nextCursor': null,
      'total': 1,
    });
  }
  if (path == '/support/tickets/4') {
    return jsonResponse(
      200,
      ticketJson(
        4,
        messages: [
          {
            'content': 'We are on it.',
            'author': {'firstName': 'Sam', 'lastName': 'Support'},
            'createdAt': '2026-11-12T01:00:00.000Z',
          },
        ],
      ),
    );
  }
  return jsonResponse(204, null);
}

Future<AuthController> pumpApp(WidgetTester tester, Future<http.Response> Function(http.Request) handler) async {
  final api = apiAnswering(handler);
  final auth = AuthController(api, AuthRepository(api));
  await tester.pumpWidget(CompanionApp(api: api, auth: auth));
  await auth.restore();
  await tester.pumpAndSettle();
  return auth;
}

Future<void> signIn(WidgetTester tester, {String password = 'Password123!'}) async {
  await tester.enterText(find.widgetWithText(TextField, 'Email'), 'owner@example.com');
  await tester.enterText(find.widgetWithText(TextField, 'Password'), password);
  await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('signed out shows sign-in; a wrong password shows the envelope copy', (tester) async {
    await pumpApp(tester, backend);
    expect(find.text('Welcome back'), findsOneWidget);

    await signIn(tester, password: 'wrong');
    expect(find.text('Invalid email or password'), findsOneWidget);
    expect(find.text('Welcome back'), findsOneWidget);
  });

  testWidgets('sign in, open a ticket from the list, sign out', (tester) async {
    final auth = await pumpApp(tester, backend);
    await signIn(tester);

    expect(find.text('Support tickets'), findsOneWidget);
    expect(find.text('Ticket 4'), findsOneWidget);
    expect(find.text('ST-4 · Open'), findsOneWidget);

    await tester.tap(find.text('Ticket 4'));
    await tester.pumpAndSettle();
    expect(find.text('Description 4'), findsOneWidget);
    expect(find.text('Sam Support'), findsOneWidget);
    expect(find.text('We are on it.'), findsOneWidget);

    // Signing out from under a pushed screen lands on sign-in, not on the screen that was open.
    await auth.signOut();
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Description 4'), findsNothing);
  });

  testWidgets('a list that fails shows Try again, and Try again loads it', (tester) async {
    var failing = true;
    await pumpApp(tester, (r) async {
      if (r.url.path.endsWith('/support/tickets') && failing) {
        return jsonResponse(500, {
          'statusCode': 500,
          'code': 'INTERNAL',
          'detail': 'Something went wrong on our side.',
        });
      }
      return backend(r);
    });
    await signIn(tester);
    expect(find.text('Something went wrong on our side.'), findsOneWidget);

    failing = false;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Ticket 4'), findsOneWidget);
  });

  testWidgets('an empty list has its own state', (tester) async {
    await pumpApp(tester, (r) async {
      if (r.url.path.endsWith('/support/tickets')) {
        return jsonResponse(200, {'items': [], 'nextCursor': null, 'total': 0});
      }
      return backend(r);
    });
    await signIn(tester);
    expect(find.text('No tickets yet'), findsOneWidget);
  });

  testWidgets('a session the server ends mid-use returns to sign-in', (tester) async {
    var revoked = false;
    await pumpApp(tester, (r) async {
      if (revoked) return jsonResponse(401, {'statusCode': 401, 'detail': 'Unauthorized'});
      return backend(r);
    });
    await signIn(tester);
    expect(find.text('Ticket 4'), findsOneWidget);

    revoked = true;
    await tester.tap(find.text('Ticket 4'));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);
  });
}
