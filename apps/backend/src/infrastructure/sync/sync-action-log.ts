export interface SyncAction {
  action: string;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

export class SyncActionLog {
  private actions: SyncAction[] = [];

  add(action: string, message: string, meta?: Record<string, unknown>): void {
    this.actions.push({
      action,
      message,
      timestamp: new Date().toISOString(),
      ...(meta !== undefined ? { meta } : {}),
    });
  }

  merge(other: SyncAction[]): void {
    this.actions.push(...other);
  }

  toArray(): SyncAction[] {
    return this.actions;
  }
}
