// Re-export all support types from the shared-types package.
// This keeps the single-source-of-truth in @sally/shared-types
// while providing a convenient import path for the web app.
export type {
  SupportCategory,
  SupportPriority,
  SupportStatus,
  SupportTicket,
  SupportTicketDetail,
  TicketMessage,
  TicketUser,
  TicketTenant,
  RelatedEntity,
  ConversationSnapshot,
  SupportStats,
  PaginatedTickets,
} from '@sally/shared-types';
