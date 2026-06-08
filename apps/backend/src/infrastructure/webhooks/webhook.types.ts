export interface SamsaraWebhookPayload {
  eventId: string;
  eventType: 'HosViolation' | 'GeofenceEntry' | 'GeofenceExit' | 'EngineFaultOn';
  eventTime: string;
  orgId: number;
  data: {
    vehicle?: { id: string; name: string };
    driver?: { id: string; name: string };
    violation?: { type: string; description: string };
    geofence?: { id: string; name: string };
    fault?: { code: string; description: string };
    [key: string]: any;
  };
}
