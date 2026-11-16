import '../../core/json.dart';

/// The signed-in person, from `/auth/login` and `/auth/me`. Only the fields the app shows.
class SessionUser {
  const SessionUser({
    required this.userId,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.role,
    required this.workspaceName,
  });

  factory SessionUser.fromJson(Map<String, dynamic> j) => SessionUser(
    userId: jsonStr(j['userId']),
    email: jsonStr(j['email']),
    firstName: jsonStr(j['firstName']),
    lastName: jsonStr(j['lastName']),
    role: jsonStr(j['role']),
    workspaceName: jsonStr(j['tenantName']),
  );

  final String userId;
  final String email;
  final String firstName;
  final String lastName;
  final String role;
  final String workspaceName;

  String get displayName {
    final name = '$firstName $lastName'.trim();
    return name.isEmpty ? email : name;
  }
}

/// One workspace to choose from when an email and password match accounts in several.
class WorkspaceChoice {
  const WorkspaceChoice({required this.tenantId, required this.name});

  factory WorkspaceChoice.fromJson(Map<String, dynamic> j) =>
      WorkspaceChoice(tenantId: jsonStr(j['tenantId']), name: jsonStr(j['name']));

  final String tenantId;
  final String name;
}
