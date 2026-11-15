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
   * Rebuild an event that already exists — keeps its id, timestamp and actor
   * exactly as recorded (an outbox row, a serialized job). Never re-resolves the
   * actor from the current EventContext: the event happened under its own.
   */
  static restore<T = unknown>(fields: RestoredDomainEventFields<T>): DomainEvent<T> {
    const event = Object.create(DomainEvent.prototype) as DomainEvent<T>;
    Object.assign(event, {
      id: fields.id,
      event: fields.event,
      tenantId: fields.tenantId,
      data: fields.data,
      actor: fields.actor,
      correlationId: fields.correlationId,
      causationId: fields.causationId,
      version: fields.version ?? 1,
      timestamp: fields.timestamp,
    });
    return event;
  }

  /**
   * Reconstruct a DomainEvent from serialized BullMQ job data.
   * Restores original id, timestamp, and version without `as any` casts.
   */
  static fromSerialized(data: DurableEventJobData): DomainEvent {
    return DomainEvent.restore({
      id: data.id,
      event: data.event,
      tenantId: data.tenantId,
      data: data.data,
      actor: toEventActor(data.actor),
      correlationId: data.correlationId ?? undefined,
      causationId: data.causationId ?? undefined,
      version: data.version,
      timestamp: new Date(data.timestamp),
    });
  }
}

/** Everything a recorded event carries — `restore` keeps every field as given. */
export interface RestoredDomainEventFields<T = unknown> {
  id: string;
  event: string;
  tenantId: string;
  data: T;
  actor?: EventActor;
  correlationId?: string;
  causationId?: string;
  version?: number;
  timestamp: Date;
}

const ACTOR_TYPES: readonly ActorType[] = ['user', 'integration', 'system', 'api-key'];

export function isActorType(value: string): value is ActorType {
  return (ACTOR_TYPES as readonly string[]).includes(value);
}

/**
 * A stored actor (`{ id, type, label }` with a free-text type) back to an
 * EventActor. An unknown type is kept as `system` rather than dropping who acted.
 */
export function toEventActor(
  stored: { id: string; type: string; label?: string | null } | null | undefined,
): EventActor | undefined {
  if (!stored) return undefined;
  return {
    id: stored.id,
    type: isActorType(stored.type) ? stored.type : 'system',
    ...(stored.label != null && { label: stored.label }),
  };
}
