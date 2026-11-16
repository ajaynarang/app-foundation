import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../widgets/async_view.dart';
import 'ticket.dart';
import 'tickets_repository.dart';

/// The example detail screen: opens with the row it came from, then loads the full record and its thread.
class TicketDetailScreen extends StatefulWidget {
  const TicketDetailScreen({super.key, required this.repository, required this.ticket});

  final TicketsRepository repository;

  /// The list's row: enough for the title while the detail loads.
  final Ticket ticket;

  @override
  State<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends State<TicketDetailScreen> {
  Ticket? _ticket;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final ticket = await widget.repository.get(widget.ticket.id);
      if (mounted) setState(() => _ticket = ticket);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(widget.ticket.ticketNumber)),
      body: AsyncView(
        loading: _ticket == null && _error == null,
        error: _error,
        onRetry: _load,
        skeleton: const SkeletonList(rows: 4),
        builder: (context) {
          final ticket = _ticket!;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(ticket.subject, style: theme.textTheme.titleLarge),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: Chip(
                  label: Text(ticket.statusLabel),
                  backgroundColor: ticket.isOpen
                      ? theme.colorScheme.primaryContainer
                      : theme.colorScheme.surfaceContainerHighest,
                ),
              ),
              const SizedBox(height: 12),
              Text(ticket.description, style: theme.textTheme.bodyLarge),
              const Divider(height: 32),
              if (ticket.messages.isEmpty)
                Text('No replies yet.', style: theme.textTheme.bodyMedium)
              else
                for (final message in ticket.messages)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(message.authorName, style: theme.textTheme.labelLarge),
                        const SizedBox(height: 2),
                        Text(message.content, style: theme.textTheme.bodyMedium),
                      ],
                    ),
                  ),
            ],
          );
        },
      ),
    );
  }
}
