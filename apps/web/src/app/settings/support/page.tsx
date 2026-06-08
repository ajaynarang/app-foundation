'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@app/ui/components/ui/tabs';
import { Button } from '@app/ui/components/ui/button';
import { Badge } from '@app/ui/components/ui/badge';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Textarea } from '@app/ui/components/ui/textarea';
import { Input } from '@app/ui/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@app/ui/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet';
import {
  Headset,
  MessageSquare,
  BookOpen,
  ExternalLink,
  Send,
  Truck,
  CreditCard,
  Plug,
  ShieldCheck,
  Route,
  Users,
} from 'lucide-react';

import { formatRelativeTime } from '@/shared/lib/utils/formatters';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@app/ui/components/ui/dialog';
import { Label } from '@app/ui/components/ui/label';
import { useMyTickets, useTicketDetail, useAddTicketMessage, useCreateTicket } from '@/features/support';
import type { SupportTicket } from '@/features/support';
import { STATUS_VARIANTS, PRIORITY_VARIANTS, CATEGORY_LABELS } from '@/features/support/constants';
import { CONSOLE_URL } from '@/shared/lib/navigation';
import { createConversation, getStreamingUrl, getAuthHeaders } from '@/features/platform/ai-chat/api';

// ─── Help Center topics ───

const HELP_TOPICS = [
  {
    icon: Truck,
    title: 'Getting Started',
    desc: 'Set up your fleet, add drivers and vehicles, create your first load',
    href: '/docs/manual/getting-started/welcome',
  },
  {
    icon: CreditCard,
    title: 'Billing & Invoicing',
    desc: 'Generate invoices, manage payments, close-out periods, settlements',
    href: '/docs/manual/web-app/dispatcher/driver-pay-settlements',
  },
  {
    icon: Plug,
    title: 'Integrations',
    desc: 'Connect Samsara, QuickBooks, and other services to SALLY',
    href: '/docs/manual/web-app/admin/tenant-settings',
  },
  {
    icon: ShieldCheck,
    title: 'Shield & Compliance',
    desc: 'Compliance scoring, document requirements, audit preparation',
    href: '/docs/manual/web-app/dispatcher/shield-compliance',
  },
  {
    icon: Route,
    title: 'Smart Route',
    desc: 'Generate smart routes with HOS compliance, fuel optimization, and decision transparency',
    href: '/docs/manual/web-app/dispatcher/route-planning',
  },
  {
    icon: Users,
    title: 'Account & Team',
    desc: 'Manage users, roles, invitations, and organization settings',
    href: '/docs/manual/web-app/admin/tenant-settings',
  },
];

// ─── Embedded support chat types ───

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// ─── Embedded Support Chat ───

function SupportChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hi! I'm Sally Support. Describe your issue and I'll investigate. If I can't resolve it, I'll create a support ticket with full context.",
    },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Abort streaming on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: content.trim(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsStreaming(true);

      try {
        // Create conversation on first message
        let convId = conversationId;
        if (!convId) {
          const conv = await createConversation('support');
          convId = conv.conversationId;
          setConversationId(convId);
        }

        // Stream the response
        const assistantMsgId = `assistant-${Date.now()}`;
        setMessages((prev) => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }]);

        abortRef.current = new AbortController();
        const response = await fetch(getStreamingUrl(convId), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ content: content.trim(), inputMode: 'text' }),
          signal: abortRef.current.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error('Stream failed');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // AI SDK data stream protocol: 0:"text chunk"\n
            if (trimmed.startsWith('0:')) {
              try {
                const text = JSON.parse(trimmed.slice(2));
                if (typeof text === 'string') {
                  fullText += text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, content: fullText.replace(/<followups>[\s\S]*?<\/followups>\s*$/, '').trimEnd() }
                        : m,
                    ),
                  );
                }
              } catch {
                /* skip malformed chunks */
              }
            }
            // Skip 8: (card), 9: (HITL), other protocol lines
          }
        }
      } catch (err) {
        if ((err as { name?: string })?.name !== 'AbortError') {
          setMessages((prev) => [
            ...prev.filter((m) => m.content !== ''),
            {
              id: `error-${Date.now()}`,
              role: 'assistant',
              content:
                'Sorry, something went wrong. Please try again or use the "New Ticket" button in the My Tickets tab.',
            },
          ]);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [conversationId, isStreaming],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col h-[38.5rem]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-foreground text-background flex items-center justify-center font-semibold text-xs">
            S
          </div>
          <p className="text-sm font-medium text-foreground">Sally Support</p>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-foreground text-background rounded-br-sm'
                    : 'bg-muted/50 border border-border text-foreground rounded-bl-sm'
                }`}
              >
                {msg.role === 'assistant' && !msg.content && isStreaming && (
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:300ms]" />
                  </span>
                )}
                {msg.role === 'assistant' && msg.content ? (
                  <div className="sally-markdown text-sm leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="border-t border-border p-3 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your issue..."
            disabled={isStreaming}
            className="flex-1"
          />
          <Button
            size="sm"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isStreaming}
            loading={isStreaming}
            className="gap-1.5 px-4"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───

export default function SupportPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('GENERAL');

  const { formatDateTime } = useFormatters();

  const { data: ticketsData, isLoading: ticketsLoading } = useMyTickets({
    status: statusFilter,
  });
  const { data: ticketDetail, isLoading: detailLoading } = useTicketDetail(selectedTicketId);
  const addMessage = useAddTicketMessage();
  const createTicket = useCreateTicket();

  const handleReply = () => {
    if (!selectedTicketId || !replyContent.trim()) return;
    addMessage.mutate(
      { ticketId: selectedTicketId, content: replyContent.trim() },
      { onSuccess: () => setReplyContent('') },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Support</h1>
        <p className="text-sm text-muted-foreground mt-1">We&apos;re here when you need us</p>
      </div>

      <Tabs
        defaultValue="sally"
        className="space-y-4"
        onValueChange={(tab) => {
          if (tab === 'tickets') {
            queryClient.invalidateQueries({ queryKey: ['support', 'tickets'] });
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="sally" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Get Help
          </TabsTrigger>
          <TabsTrigger value="tickets" className="gap-2">
            <Headset className="h-4 w-4" />
            My Tickets
            {ticketsData && ticketsData.total > 0 && (
              <Badge variant="outline" className="ml-1 h-5 min-w-5 px-1">
                {ticketsData.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="help" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Help Center
          </TabsTrigger>
        </TabsList>

        {/* ─── Get Help Tab (Embedded Support Chat) ─── */}
        <TabsContent value="sally">
          <SupportChat />
        </TabsContent>

        {/* ─── My Tickets Tab ─── */}
        <TabsContent value="tickets" className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={statusFilter ?? 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? undefined : v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="WAITING_ON_CUSTOMER">Waiting</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto">
              <Button size="sm" onClick={() => setNewTicketOpen(true)} className="gap-1.5">
                + New Ticket
              </Button>
            </div>
          </div>

          {ticketsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : !ticketsData?.tickets.length ? (
            <div className="text-center py-12">
              <Headset className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <h3 className="font-medium text-foreground">No support tickets</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Use the &quot;Get Help&quot; tab to chat with Sally — she&apos;ll create a ticket if needed
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {ticketsData.tickets.map((ticket: SupportTicket) => (
                <button
                  key={ticket.id}
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className="w-full text-left rounded-lg border border-border bg-card p-4 hover:border-muted-foreground/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-muted-foreground">{ticket.ticketNumber}</span>
                        <span className="font-medium text-sm text-foreground truncate">{ticket.subject}</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{ticket.description}</p>
                    </div>
                    <Badge variant="outline" className={STATUS_VARIANTS[ticket.status].className}>
                      {STATUS_VARIANTS[ticket.status].label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className={PRIORITY_VARIANTS[ticket.priority].className}>
                      {PRIORITY_VARIANTS[ticket.priority].label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[ticket.category]}</span>
                    <span className="text-xs text-muted-foreground ml-auto font-mono">
                      {formatRelativeTime(ticket.createdAt)}
                    </span>
                    {ticket.aiResolved && (
                      <Badge variant="outline" className="text-xs">
                        Resolved by AI
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Help Center Tab ─── */}
        <TabsContent value="help" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {HELP_TOPICS.map((topic) => {
              const Icon = topic.icon;
              return (
                <a
                  key={topic.title}
                  href={`${CONSOLE_URL}${topic.href}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-border bg-card p-4 hover:border-muted-foreground/30 transition-colors group"
                >
                  <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center mb-3">
                    <Icon className="h-4 w-4 text-foreground" />
                  </div>
                  <div className="flex items-center gap-1 mb-1">
                    <h3 className="text-sm font-medium text-foreground">{topic.title}</h3>
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{topic.desc}</p>
                </a>
              );
            })}
          </div>

          <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between max-w-lg">
            <div>
              <h3 className="text-sm font-medium text-foreground">Can&apos;t find what you&apos;re looking for?</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Browse the full documentation</p>
            </div>
            <a href={`${CONSOLE_URL}/docs`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                Browse Docs
                <ExternalLink className="h-3 w-3" />
              </Button>
            </a>
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Ticket Detail Sheet ─── */}
      <Sheet
        open={selectedTicketId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTicketId(null);
        }}
      >
        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col" pinnable resizable>
          <SheetHeader sticky>
            <SheetTitle className="flex items-center gap-2">
              {ticketDetail && (
                <>
                  <span className="font-mono text-sm text-muted-foreground">{ticketDetail.ticketNumber}</span>
                  <Badge variant="outline" className={STATUS_VARIANTS[ticketDetail.status].className}>
                    {STATUS_VARIANTS[ticketDetail.status].label}
                  </Badge>
                </>
              )}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {detailLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : ticketDetail ? (
              <>
                <h3 className="text-base font-semibold text-foreground">{ticketDetail.subject}</h3>

                <div className="space-y-2 text-sm">
                  <div className="flex gap-3">
                    <span className="text-muted-foreground w-20 shrink-0">Category</span>
                    <span className="text-foreground">{CATEGORY_LABELS[ticketDetail.category]}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground w-20 shrink-0">Priority</span>
                    <Badge variant="outline" className={PRIORITY_VARIANTS[ticketDetail.priority].className}>
                      {PRIORITY_VARIANTS[ticketDetail.priority].label}
                    </Badge>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground w-20 shrink-0">Created</span>
                    <span className="text-foreground font-mono text-xs">{formatDateTime(ticketDetail.createdAt)}</span>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{ticketDetail.description}</p>
                </div>

                {ticketDetail.messages.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Messages</h4>
                    {ticketDetail.messages.map((msg) => (
                      <div
                        key={msg.messageId}
                        className={`rounded-lg p-3 text-sm ${
                          msg.authorRole === 'admin'
                            ? 'bg-muted/50 border border-border'
                            : 'bg-card border border-border'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium text-foreground">
                            {msg.author.firstName} {msg.author.lastName}
                            {msg.authorRole === 'admin' && (
                              <Badge variant="outline" className="ml-1.5 text-2xs py-0">
                                Support
                              </Badge>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {formatRelativeTime(msg.createdAt)}
                          </span>
                        </div>
                        <p className="text-foreground whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>

          {ticketDetail && !['RESOLVED', 'CLOSED'].includes(ticketDetail.status) && (
            <div className="border-t border-border p-4 space-y-2">
              <Textarea
                placeholder="Type your reply..."
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="min-h-[4.6rem] resize-none"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleReply}
                  loading={addMessage.isPending}
                  disabled={!replyContent.trim()}
                  className="gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send Reply
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── New Ticket Dialog ─── */}
      <Dialog open={newTicketOpen} onOpenChange={setNewTicketOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Support Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="Brief description of the issue"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                maxLength={500}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the issue in detail..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="min-h-[7.7rem]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GENERAL">General</SelectItem>
                  <SelectItem value="TECHNICAL">Technical</SelectItem>
                  <SelectItem value="BILLING">Billing</SelectItem>
                  <SelectItem value="INTEGRATION">Integration</SelectItem>
                  <SelectItem value="ACCOUNT">Account</SelectItem>
                  <SelectItem value="FEATURE_REQUEST">Feature Request</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTicketOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!newSubject.trim() || !newDescription.trim()) return;
                createTicket.mutate(
                  {
                    subject: newSubject.trim(),
                    description: newDescription.trim(),
                    category: newCategory,
                  },
                  {
                    onSuccess: () => {
                      setNewTicketOpen(false);
                      setNewSubject('');
                      setNewDescription('');
                      setNewCategory('GENERAL');
                    },
                  },
                );
              }}
              loading={createTicket.isPending}
              disabled={!newSubject.trim() || !newDescription.trim()}
            >
              Create Ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
