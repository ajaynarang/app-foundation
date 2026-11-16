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

  /// The last load's failure copy; cleared when the next load starts.
  String? error;

  String? _nextCursor;
  bool _disposed = false;

  // Bumped by every refresh: a page asked for before the refresh belongs to the old list and is dropped.
  int _generation = 0;

  bool get hasMore => _nextCursor != null;

  /// Loads the first page again. Rows already on screen stay there if it fails.
  Future<void> refresh() {
    _generation++;
    return _load(null);
  }

  Future<void> loadMore() async {
    if (hasMore && !loadingMore) await _load(_nextCursor);
  }

  Future<void> _load(String? cursor) async {
    final generation = _generation;
    cursor == null ? loading = items.isEmpty : loadingMore = true;
    error = null;
    _notify();
    try {
      final page = await _repository.list(cursor: cursor);
      if (generation != _generation) return;
      items = cursor == null ? page.items : [...items, ...page.items];
      total = page.total;
      _nextCursor = page.nextCursor;
      error = null;
    } on ApiException catch (e) {
      if (generation != _generation) return;
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
