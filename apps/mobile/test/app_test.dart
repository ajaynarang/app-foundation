import 'package:flutter_test/flutter_test.dart';

import 'package:app_mobile/main.dart';

void main() {
  testWidgets('companion app renders status and sign-in tabs', (tester) async {
    await tester.pumpWidget(const CompanionApp());
    await tester.pump();

    expect(find.text('Platform status'), findsOneWidget);
    expect(find.text('Status'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
  });
}
