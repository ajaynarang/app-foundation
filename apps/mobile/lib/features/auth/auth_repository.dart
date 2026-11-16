import '../../core/api_client.dart';
import '../../core/json.dart';
import 'session_user.dart';

class AuthRepository {
  const AuthRepository(this._api);

  final ApiClient _api;

  /// Email and password sign-in. A 409 `WORKSPACE_SELECTION_REQUIRED` means the password matched accounts in
  /// several workspaces: read them with [workspaceChoices] and call again with one `tenantId`.
  Future<SessionUser> login(String email, String password, {String? tenantId}) async {
    final res = await _api.startSession(
      '/auth/login',
      body: {'email': email, 'password': password, if (tenantId != null) 'tenantId': tenantId},
    );
    return SessionUser.fromJson(jsonMap(res['user']));
  }

  Future<SessionUser> me() async => SessionUser.fromJson(await _api.get('/auth/me'));

  /// Revokes the refresh token on the server.
  Future<void> logout() => _api.post('/auth/logout');

  static List<WorkspaceChoice> workspaceChoices(ApiException e) => e.code == 'WORKSPACE_SELECTION_REQUIRED'
      ? jsonList(e.envelope['workspaces']).map(WorkspaceChoice.fromJson).toList()
      : const [];
}
