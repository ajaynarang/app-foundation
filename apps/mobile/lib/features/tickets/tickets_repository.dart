import '../../core/api_client.dart';
import '../../core/cursor_page.dart';
import 'ticket.dart';

class TicketsRepository {
  const TicketsRepository(this._api);

  final ApiClient _api;

  /// One page of the signed-in person's tickets, newest first. Pass the last page's `nextCursor` for the next.
  Future<CursorPage<Ticket>> list({String? cursor}) async => CursorPage.fromJson(
    await _api.get('/support/tickets', query: {if (cursor != null) 'cursor': cursor}),
    Ticket.fromJson,
  );

  Future<Ticket> get(int id) async => Ticket.fromJson(await _api.get('/support/tickets/$id'));
}
