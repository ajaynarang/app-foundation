export interface BaseEventPayload {
  entityId: string;
  entityType: string;
}

export interface UpdateEventPayload extends BaseEventPayload {
  changedFields: string[];
}

export interface StatusChangePayload extends BaseEventPayload {
  previousStatus: string;
  newStatus: string;
}
