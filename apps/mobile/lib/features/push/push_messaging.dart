import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../../core/app_config.dart';

/// What the app needs from the OS push service. The registrar depends on this, so tests need no Firebase.
abstract class PushMessaging {
  /// Asks the person to allow notifications. Call it after sign-in, never at cold boot.
  Future<bool> requestPermission();

  /// This device's FCM registration token, or null when there is none yet.
  Future<String?> getToken();

  Stream<String> get onTokenRefresh;

  /// Makes the token dead, so nothing sent to it reaches this device. The next [getToken] makes a new one.
  Future<void> deleteToken();
}

/// Firebase Cloud Messaging: FCM on Android, APNs through FCM on iOS. The backend's notification pipeline sends to
/// the tokens registered at `POST /notifications/devices`.
class FirebasePushMessaging implements PushMessaging {
  FirebasePushMessaging._();

  /// Null when push is off: the Firebase values are not set (see `AppConfig`), or this is not a phone build.
  static Future<PushMessaging?> tryCreate() async {
    final isPhone =
        !kIsWeb && (defaultTargetPlatform == TargetPlatform.iOS || defaultTargetPlatform == TargetPlatform.android);
    if (!isPhone || !AppConfig.pushConfigured) return null;
    try {
      await Firebase.initializeApp(
        options: const FirebaseOptions(
          apiKey: AppConfig.firebaseApiKey,
          appId: AppConfig.firebaseAppId,
          messagingSenderId: AppConfig.firebaseMessagingSenderId,
          projectId: AppConfig.firebaseProjectId,
        ),
      );
      return FirebasePushMessaging._();
    } catch (e) {
      debugPrint('Push is off: Firebase did not start ($e).');
      return null;
    }
  }

  @override
  Future<bool> requestPermission() async {
    try {
      final settings = await FirebaseMessaging.instance.requestPermission();
      return settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional;
    } catch (e) {
      debugPrint('Could not ask for notification permission ($e).');
      return false;
    }
  }

  @override
  Future<String?> getToken() async {
    try {
      return await FirebaseMessaging.instance.getToken();
    } catch (e) {
      // iOS has no token until APNs answers (never on a simulator); onTokenRefresh delivers it later.
      debugPrint('No push token yet ($e).');
      return null;
    }
  }

  @override
  Stream<String> get onTokenRefresh => FirebaseMessaging.instance.onTokenRefresh;

  @override
  Future<void> deleteToken() async {
    try {
      await FirebaseMessaging.instance.deleteToken();
    } catch (e) {
      debugPrint('Could not delete the push token ($e).');
    }
  }
}
