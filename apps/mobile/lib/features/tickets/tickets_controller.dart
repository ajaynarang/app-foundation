import 'package:flutter/foundation.dart';

import '../../core/api_client.dart';
import 'ticket.dart';
import 'tickets_repository.dart';

/// The state of the ticket list: the pages loaded so far and how to get the next one.
/// Copy this for any cursor list: only the repository call and the item type change.
class TicketsController extends ChangeNotifier {
  TicketsController(this._repository);

  final TicketsRepository _repository;

  List<Ticket> items = const [];
  int total = 0;

  /// True until the first page has answered.
  bool loading = true;
  bool loadingMore = false;

  /// The last failure's copy, cleared by the next success.
  String? error;

  String? _nextCursor;
  bool _disposed = false;

  bool get hasMore => _nextCursor != null;

  /// Loads the first page again. Rows already on screen stay there if it fails.
  Future<void> refresh() => _load(null);

  Future<void> loadMore() async {
    if (hasMore && !loadingMore) await _load(_nextCursor);
  }

  Future<void> _load(String? cursor) async {
    cursor == null ? loading = items.isEmpty : loadingMore = true;
    _notify();
    try {
      final page = await _repository.list(cursor: cursor);
      items = cursor == null ? page.items : [...items, ...page.items];
      total = page.total;
      _nextCursor = page.nextCursor;
      error = null;
    } on ApiException catch (e) {
      error = e.message;
    }
    loading = false;
    loadingMore = false;
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
