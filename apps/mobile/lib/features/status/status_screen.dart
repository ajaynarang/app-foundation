import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/app_config.dart';

/// Platform status — calls the backend /health/ready endpoint and renders the
/// component checks. Works unauthenticated, so it doubles as the "is my
/// stack wired correctly?" screen for a freshly-cloned foundation.
class StatusScreen extends StatefulWidget {
  const StatusScreen({super.key, required this.api});

  final ApiClient api;

  @override
  State<StatusScreen> createState() => _StatusScreenState();
}

class _StatusScreenState extends State<StatusScreen> {
  late Future<Map<String, dynamic>> _health;

  @override
  void initState() {
    super.initState();
    _health = widget.api.get('/health/ready');
  }

  void _refresh() {
    setState(() => _health = widget.api.get('/health/ready'));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Platform status'),
        actions: [
          IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _health,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _ErrorState(error: snapshot.error.toString(), onRetry: _refresh);
          }
          final data = snapshot.data ?? const {};
          final checks = (data['info'] ?? data['details']) as Map<String, dynamic>? ?? const {};
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: ListTile(
                  leading: Icon(
                    data['status'] == 'ok' ? Icons.check_circle : Icons.error,
                    color: data['status'] == 'ok' ? Colors.green : Colors.red,
                  ),
                  title: Text('API ${data['status'] ?? 'unknown'}'),
                  subtitle: Text(AppConfig.apiBaseUrl),
                ),
              ),
              const SizedBox(height: 8),
              for (final entry in checks.entries)
                ListTile(
                  leading: Icon(
                    (entry.value as Map<String, dynamic>?)?['status'] == 'up'
                        ? Icons.check_circle_outline
                        : Icons.highlight_off,
                    color: (entry.value as Map<String, dynamic>?)?['status'] == 'up' ? Colors.green : Colors.orange,
                  ),
                  title: Text(entry.key),
                  subtitle: Text('${(entry.value as Map<String, dynamic>?)?['status'] ?? '?'}'),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.error, required this.onRetry});

  final String error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, size: 48),
            const SizedBox(height: 12),
            Text('Cannot reach the API', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(error, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
