import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app_mobile/core/api_client.dart';
import 'package:app_mobile/features/auth/auth_controller.dart';
import 'package:app_mobile/features/auth/auth_repository.dart';

import 'helpers.dart';

AuthController controllerFor(ApiClient api) => AuthController(api, AuthRepository(api));

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('with no stored session, boot ends signed out without calling the API', () async {
    final log = <String>[];
    final auth = controllerFor(apiAnswering((_) async => jsonResponse(200, {}), log: log));
    await auth.restore();
    expect(auth.status, AuthStatus.signedOut);
    expect(log, isEmpty);
  });

  test('a stored session is checked with /auth/me and signs in', () async {
    FlutterSecureStorage.setMockInitialValues({'accessToken': 'a', 'refreshToken': 'r'});
    final auth = controllerFor(apiAnswering((_) async => jsonResponse(200, userJson)));
    await auth.restore();
    expect(auth.status, AuthStatus.signedIn);
    expect(auth.user?.displayName, 'Olive Owner');
    expect(auth.user?.workspaceName, 'Acme');
  });

  test('a stored session the server refuses ends at sign-in', () async {
    FlutterSecureStorage.setMockInitialValues({'accessToken': 'a', 'refreshToken': 'r'});
    final auth = controllerFor(
      apiAnswering((_) async => jsonResponse(401, {'statusCode': 401, 'detail': 'Unauthorized'})),
    );
    await auth.restore();
    expect(auth.status, AuthStatus.signedOut);
  });

  test('starting offline keeps the stored session', () async {
    FlutterSecureStorage.setMockInitialValues({'accessToken': 'a', 'refreshToken': 'r'});
    final auth = controllerFor(apiAnswering((_) async => jsonResponse(503, null, reasonPhrase: 'Service Unavailable')));
    await auth.restore();
    expect(auth.status, AuthStatus.signedIn);
    expect(auth.user, isNull);
  });

  test('sign-in, then sign-out revokes on the server and clears the device', () async {
    final log = <String>[];
    final auth = controllerFor(
      apiAnswering(
        (r) async => r.url.path.endsWith('/auth/login')
            ? jsonResponse(200, {'accessToken': 'a', 'user': userJson}, refreshCookie: 'r')
            : jsonResponse(204, null),
        log: log,
      ),
    );
    await auth.signIn('owner@example.com', 'Password123!');
    expect(auth.status, AuthStatus.signedIn);

    await auth.signOut();
    expect(auth.status, AuthStatus.signedOut);
    expect(auth.user, isNull);
    expect(log, ['POST /auth/login', 'POST /auth/logout']);
    expect(await const FlutterSecureStorage().read(key: 'refreshToken'), isNull);
  });

  test('a 409 WORKSPACE_SELECTION_REQUIRED carries the workspaces to choose from', () async {
    final auth = controllerFor(
      apiAnswering(
        (_) async => jsonResponse(409, {
          'statusCode': 409,
          'code': 'WORKSPACE_SELECTION_REQUIRED',
          'detail': 'This email signs in to more than one workspace. Choose the one you want.',
          'workspaces': [
            {'tenantId': 'acme', 'name': 'Acme'},
            {'tenantId': 'globex', 'name': 'Globex'},
          ],
        }),
      ),
    );
    try {
      await auth.signIn('owner@example.com', 'x');
      fail('expected an ApiException');
    } on ApiException catch (e) {
      final choices = AuthRepository.workspaceChoices(e);
      expect(choices.map((w) => w.tenantId), ['acme', 'globex']);
      expect(choices.first.name, 'Acme');
    }
    expect(auth.status, AuthStatus.unknown);
  });
}
