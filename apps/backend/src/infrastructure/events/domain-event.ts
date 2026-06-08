import { generateUuidV7 } from '../../shared/utils/uuidv7';
import { EventContext } from './event-context';
import { DurableEventJobData } from './durable-event.types';

export type ActorType = 'user' | 'integration' | 'system' | 'api-key';

export interface EventActor {
  id: string;
  type: ActorType;
  label?: string;
}

export class DomainEvent<T = unknown> {
  readonly id: string;
  readonly timestamp: Date;
  readonly version: number;
  readonly actor: EventActor | undefined;

  constructor(
    public readonly event: string,
    public readonly tenantId: string,
    public readonly data: T,
    actor?: EventActor,
    public readonly correlationId?: string,
    public readonly causationId?: string,
  ) {
    this.id = generateUuidV7();
    this.timestamp = new Date();
    this.version = 1;
    // Auto-resolve actor from EventContext if not explicitly provided
    this.actor = actor ?? EventContext.getActor();
  }

  /**
   * Reconstruct a DomainEvent from serialized BullMQ job data.
   * Restores original id, timestamp, and version without `as any` casts.
   */
  static fromSerialized(data: DurableEventJobData): DomainEvent {
    const event = Object.create(DomainEvent.prototype) as DomainEvent;
    Object.assign(event, {
      id: data.id,
      event: data.event,
      tenantId: data.tenantId,
      data: data.data,
      actor: data.actor ?? undefined,
      correlationId: data.correlationId ?? undefined,
      causationId: data.causationId ?? undefined,
      version: data.version,
      timestamp: new Date(data.timestamp),
    });
    return event;
  }
}
