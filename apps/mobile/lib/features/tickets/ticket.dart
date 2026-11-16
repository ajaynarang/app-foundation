import '../../core/json.dart';

/// A support ticket, as `GET /support/tickets` and `GET /support/tickets/:id` answer it. Only what the app shows.
class Ticket {
  const Ticket({
    required this.id,
    required this.ticketNumber,
    required this.subject,
    required this.description,
    required this.status,
    required this.messageCount,
    required this.createdAt,
    this.messages = const [],
  });

  factory Ticket.fromJson(Map<String, dynamic> j) => Ticket(
    id: jsonInt(j['id']),
    ticketNumber: jsonStr(j['ticketNumber']),
    subject: jsonStr(j['subject']),
    description: jsonStr(j['description']),
    status: jsonStr(j['status']),
    messageCount: jsonInt(j['messageCount']),
    createdAt: jsonDate(j['createdAt']),
    messages: jsonList(j['messages']).map(TicketMessage.fromJson).toList(),
  );

  /// The numeric id the routes address the ticket by. People read [ticketNumber].
  final int id;
  final String ticketNumber;
  final String subject;
  final String description;

  /// The API's enum value, e.g. `IN_PROGRESS`.
  final String status;
  final int messageCount;
  final DateTime? createdAt;

  /// The thread. Only on the detail read.
  final List<TicketMessage> messages;

  /// `IN_PROGRESS` → `In progress`.
  String get statusLabel {
    final words = status.replaceAll('_', ' ').toLowerCase();
    return words.isEmpty ? '' : words[0].toUpperCase() + words.substring(1);
  }

  bool get isOpen => status != 'RESOLVED' && status != 'CLOSED';
}

class TicketMessage {
  const TicketMessage({required this.authorName, required this.content, required this.createdAt});

  factory TicketMessage.fromJson(Map<String, dynamic> j) {
    final author = jsonMap(j['author']);
    return TicketMessage(
      authorName: '${jsonStr(author['firstName'])} ${jsonStr(author['lastName'])}'.trim(),
      content: jsonStr(j['content']),
      createdAt: jsonDate(j['createdAt']),
    );
  }

  final String authorName;
  final String content;
  final DateTime? createdAt;
}
