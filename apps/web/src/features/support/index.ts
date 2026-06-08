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
} from './types';
export * from './hooks';
export { supportApi, adminSupportApi } from './api';
