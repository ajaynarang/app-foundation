import { z } from 'zod';

// ── Conversation Types (Assistant AI) ──

export const ConversationGreetingSchema = z.object({
  messageId: z.string(),
  role: z.string(),
  content: z.string(),
  inputMode: z.string(),
  speakText: z.string().optional(),
  createdAt: z.string(),
});
export type ConversationGreeting = z.infer<typeof ConversationGreetingSchema>;

export const CreateConversationResponseSchema = z.object({
  conversationId: z.string(),
  userMode: z.string(),
  createdAt: z.string(),
  greeting: ConversationGreetingSchema,
});
export type CreateConversationResponse = z.infer<typeof CreateConversationResponseSchema>;

export const MessageResponseSchema = z.object({
  messageId: z.string(),
  role: z.string(),
  content: z.string(),
  inputMode: z.string(),
  intent: z.string().optional(),
  card: z.any().optional(),
  action: z.any().optional(),
  speakText: z.string().optional(),
  createdAt: z.string(),
});
export type MessageResponse = z.infer<typeof MessageResponseSchema>;

export const ConversationSummarySchema = z.object({
  conversationId: z.string(),
  userMode: z.string(),
  title: z.string().nullable(),
  messageCount: z.number(),
  lastMessageAt: z.string(),
  createdAt: z.string(),
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

export const ListConversationsResponseSchema = z.object({
  conversations: z.array(ConversationSummarySchema),
});
export type ListConversationsResponse = z.infer<typeof ListConversationsResponseSchema>;

export const GetMessagesResponseSchema = z.object({
  conversationId: z.string(),
  userMode: z.string(),
  title: z.string().nullable(),
  messages: z.array(MessageResponseSchema),
});
export type GetMessagesResponse = z.infer<typeof GetMessagesResponseSchema>;
