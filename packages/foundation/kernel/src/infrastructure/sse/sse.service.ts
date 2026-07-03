import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';

interface SseClient {
  userId: string;
  tenantId: number;
  subject: Subject<MessageEvent>;
}

/**
 * In-process SSE client registry.
 *
 * Multiple browser tabs for the same user each get their own entry in the
 * Set, so a second tab does not clobber the first tab's connection.
 * `removeClient` requires the subject reference so it removes the right
 * entry rather than dropping every tab for the user.
 */
@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);
  private readonly clients = new Map<string, Set<SseClient>>();

  addClient(userId: string, tenantId: number, subject: Subject<MessageEvent>): void {
    const set = this.clients.get(userId) ?? new Set<SseClient>();
    set.add({ userId, tenantId, subject });
    this.clients.set(userId, set);
    this.logger.log(
      `SSE client connected: ${userId} (tenant: ${tenantId}). Tabs for user: ${set.size}. Total users: ${this.clients.size}`,
    );
  }

  removeClient(userId: string, subject: Subject<MessageEvent>): void {
    const set = this.clients.get(userId);
    if (!set) return;
    for (const client of set) {
      if (client.subject === subject) {
        client.subject.complete();
        set.delete(client);
        break;
      }
    }
    if (set.size === 0) {
      this.clients.delete(userId);
    }
    this.logger.log(`SSE client disconnected: ${userId}. Total users: ${this.clients.size}`);
  }

  getClientCount(): number {
    let total = 0;
    for (const set of this.clients.values()) total += set.size;
    return total;
  }

  /**
   * @internal
   * Bridge-only. Domain code MUST emit a DomainEvent and let
   * DomainEventSseBridge route it. Direct calls outside infrastructure/sse/
   * are blocked by the no-restricted-imports ESLint rule.
   */
  emitToTenant(tenantId: number, eventType: string, data: unknown): void {
    const event = {
      data: JSON.stringify(data),
      type: eventType,
    } as MessageEvent;
    for (const set of this.clients.values()) {
      for (const client of set) {
        if (client.tenantId === tenantId) {
          client.subject.next(event);
        }
      }
    }
  }

  /**
   * @internal
   * Bridge-only — see emitToTenant for details. Pass User.userId (the string
   * column from users.user_id), NOT User.id (numeric) or User.firebaseUid.
   */
  emitToUser(userId: string, eventType: string, data: unknown): void {
    const set = this.clients.get(userId);
    if (!set) return;
    const event = {
      data: JSON.stringify(data),
      type: eventType,
    } as MessageEvent;
    for (const client of set) {
      client.subject.next(event);
    }
  }
}
