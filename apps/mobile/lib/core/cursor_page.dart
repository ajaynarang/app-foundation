import 'json.dart';

/// One page of the API's list envelope, `CursorList<T>`: `{ items, nextCursor, total }`.
/// `nextCursor` is opaque: send it back as `cursor` for the next page; null means this was the last one.
class CursorPage<T> {
  const CursorPage({required this.items, required this.nextCursor, required this.total});

  factory CursorPage.fromJson(Map<String, dynamic> j, T Function(Map<String, dynamic>) item) {
    final next = jsonStr(j['nextCursor']);
    return CursorPage(
      items: jsonList(j['items']).map(item).toList(),
      nextCursor: next.isEmpty ? null : next,
      total: jsonInt(j['total']),
    );
  }

  final List<T> items;
  final String? nextCursor;

  /// Rows in the current view (filters applied), across every page.
  final int total;
}
