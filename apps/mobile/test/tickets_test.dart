import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import 'package:app_mobile/core/cursor_page.dart';
import 'package:app_mobile/features/tickets/ticket.dart';
import 'package:app_mobile/features/tickets/tickets_controller.dart';
import 'package:app_mobile/features/tickets/tickets_repository.dart';

import 'helpers.dart';

void main() {
  test('a page parses the cursor envelope and coerces odd types instead of throwing', () {
    final page = CursorPage.fromJson({
      'items': [
        {'id': '7', 'ticketNumber': 7, 'subject': null, 'status': 'IN_PROGRESS', 'messageCount': '2'},
        'not a ticket',
      ],
      'nextCursor': null,
      'total': '1',
    }, Ticket.fromJson);

    expect(page.items, hasLength(1));
    expect(page.items.single.id, 7);
    expect(page.items.single.ticketNumber, '7');
    expect(page.items.single.subject, '');
    expect(page.items.single.statusLabel, 'In progress');
    expect(page.items.single.messageCount, 2);
    expect(page.nextCursor, isNull);
    expect(page.total, 1);
  });

  test('the controller walks pages by cursor and stops at the last one', () async {
    final cursors = <String?>[];
    final controller = TicketsController(
      TicketsRepository(
        apiAnswering((r) async {
          final cursor = r.url.queryParameters['cursor'];
          cursors.add(cursor);
          return cursor == null
              ? jsonResponse(200, {
                  'items': [ticketJson(1), ticketJson(2)],
                  'nextCursor': 'c2',
                  'total': 3,
                })
              : jsonResponse(200, {
                  'items': [ticketJson(3)],
                  'nextCursor': null,
                  'total': 3,
                });
        }),
      ),
    );
    expect(controller.loading, isTrue);

    await controller.refresh();
    expect(controller.items.map((t) => t.id), [1, 2]);
    expect(controller.hasMore, isTrue);

    await controller.loadMore();
    expect(controller.items.map((t) => t.id), [1, 2, 3]);
    expect(controller.total, 3);
    expect(controller.hasMore, isFalse);

    await controller.loadMore();
    expect(cursors, [null, 'c2']);
  });

  test('a page asked for before a refresh is dropped when it answers after it', () async {
    final page2 = Completer<void>();
    final controller = TicketsController(
      TicketsRepository(
        apiAnswering((r) async {
          if (r.url.queryParameters['cursor'] == null) {
            return jsonResponse(200, {
              'items': [ticketJson(9), ticketJson(1)],
              'nextCursor': 'c2',
              'total': 3,
            });
          }
          await page2.future;
          return jsonResponse(200, {
            'items': [ticketJson(1)],
            'nextCursor': null,
            'total': 3,
          });
        }),
      ),
    );
    await controller.refresh();
    final stale = controller.loadMore();
    await controller.refresh();
    page2.complete();
    await stale;

    expect(controller.items.map((t) => t.id), [9, 1]);
    expect(controller.hasMore, isTrue);
  });

  test('a failed page keeps the rows on screen and shows the envelope copy', () async {
    var calls = 0;
    final controller = TicketsController(
      TicketsRepository(
        apiAnswering(
          (_) async => calls++ == 0
              ? jsonResponse(200, {
                  'items': [ticketJson(1)],
                  'nextCursor': 'c2',
                  'total': 2,
                })
              : jsonResponse(400, {'statusCode': 400, 'code': 'INVALID_CURSOR', 'detail': 'That cursor is not valid.'}),
        ),
      ),
    );
    await controller.refresh();
    await controller.loadMore();

    expect(controller.items, hasLength(1));
    expect(controller.error, 'That cursor is not valid.');
    expect(controller.loadingMore, isFalse);
  });
}
