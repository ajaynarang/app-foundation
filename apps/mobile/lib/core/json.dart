/// The one set of JSON coercion helpers. A model's `fromJson` reads every field through these, never a hard cast:
/// a cast throws when the API answers an unexpected type, and that blanks the whole screen.
library;

String jsonStr(Object? v, [String fallback = '']) => v == null ? fallback : v.toString();

num? jsonNum(Object? v) => v is num ? v : (v is String ? num.tryParse(v) : null);

int jsonInt(Object? v, [int fallback = 0]) => jsonNum(v)?.toInt() ?? fallback;

double jsonDouble(Object? v, [double fallback = 0]) => jsonNum(v)?.toDouble() ?? fallback;

DateTime? jsonDate(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;

Map<String, dynamic> jsonMap(Object? v) => v is Map<String, dynamic> ? v : const <String, dynamic>{};

List<Map<String, dynamic>> jsonList(Object? v) => v is List
    ? [
        for (final e in v)
          if (e is Map<String, dynamic>) e,
      ]
    : const <Map<String, dynamic>>[];
