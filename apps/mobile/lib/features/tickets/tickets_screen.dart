import 'package:flutter/material.dart';

import '../../widgets/async_view.dart';
import 'ticket.dart';
import 'ticket_detail_screen.dart';
import 'tickets_controller.dart';
import 'tickets_repository.dart';

/// The example list: a cursor list with a skeleton, an error card, an empty state, pull to refresh and
/// load-as-you-scroll. Its rows open the example detail screen.
class TicketsScreen extends StatefulWidget {
  const TicketsScreen({super.key, required this.repository});

  final TicketsRepository repository;

  @override
  State<TicketsScreen> createState() => _TicketsScreenState();
}

class _TicketsScreenState extends State<TicketsScreen> {
  late final _controller = TicketsController(widget.repository);

  @override
  void initState() {
    super.initState();
    _controller.refresh();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _pullToRefresh() async {
    await _controller.refresh();
    final error = _controller.error;
    if (!mounted || error == null) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Support tickets')),
      body: ListenableBuilder(
        listenable: _controller,
        builder: (context, _) {
          final c = _controller;
          return AsyncView(
            loading: c.loading,
            // With rows on screen a failed refresh is a SnackBar, not a blank screen.
            error: c.items.isEmpty ? c.error : null,
            onRetry: c.refresh,
            skeleton: const SkeletonList(),
            builder: (context) => c.items.isEmpty
                ? EmptyState(
                    icon: Icons.inbox_outlined,
                    title: 'No tickets yet',
                    subtitle: 'Tickets you raise with support show up here.',
                    action: TextButton(onPressed: c.refresh, child: const Text('Refresh')),
                  )
                : RefreshIndicator(
                    onRefresh: _pullToRefresh,
                    child: ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      itemCount: c.items.length + (c.hasMore ? 1 : 0),
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, i) {
                        if (i == c.items.length) return _MoreRow(controller: c);
                        final ticket = c.items[i];
                        return _TicketRow(
                          ticket: ticket,
                          onTap: () => Navigator.of(context, rootNavigator: true).push(
                            MaterialPageRoute<void>(
                              builder: (_) => TicketDetailScreen(repository: widget.repository, ticket: ticket),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
          );
        },
      ),
    );
  }
}

class _TicketRow extends StatelessWidget {
  const _TicketRow({required this.ticket, required this.onTap});

  final Ticket ticket;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Text(ticket.subject, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text('${ticket.ticketNumber} · ${ticket.statusLabel}'),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }
}

/// The last row while more pages exist: it asks for the next page when it scrolls into view, and turns into a
/// Try again button if that page fails.
class _MoreRow extends StatefulWidget {
  const _MoreRow({required this.controller});

  final TicketsController controller;

  @override
  State<_MoreRow> createState() => _MoreRowState();
}

class _MoreRowState extends State<_MoreRow> {
  @override
  void initState() {
    super.initState();
    // Built means scrolled into view. After the frame: loading notifies listeners, which must not happen in build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && widget.controller.error == null) {
        widget.controller.loadMore();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Center(
        child: c.error != null && !c.loadingMore
            ? TextButton(onPressed: c.loadMore, child: const Text('Try again'))
            : const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)),
      ),
    );
  }
}
