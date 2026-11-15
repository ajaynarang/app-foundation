import { Injectable } from '@nestjs/common';
import type { DeadlineHandler } from './deadline.types';

/**
 * Handlers by deadline kind. Each app module registers its own on init (see `DEADLINE_HANDLERS`);
 * the sweeper looks a kind up when its row comes due. A kind has exactly one handler — two would
 * race to decide the same timer.
 */
@Injectable()
export class DeadlineHandlerRegistry {
  private readonly handlers = new Map<string, DeadlineHandler>();

  register(handler: DeadlineHandler): void {
    if (this.handlers.has(handler.kind)) {
      throw new Error(`A deadline handler for kind "${handler.kind}" is already registered`);
    }
    this.handlers.set(handler.kind, handler);
  }

  get(kind: string): DeadlineHandler | undefined {
    return this.handlers.get(kind);
  }

  kinds(): string[] {
    return [...this.handlers.keys()].sort();
  }
}
