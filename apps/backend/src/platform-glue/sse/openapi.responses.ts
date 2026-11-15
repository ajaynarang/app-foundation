import { z } from 'zod';
import { defineResponseSchema } from '@appshore/platform/shared/openapi/api-result';

/**
 * `GET /sse/stream`: a `text/event-stream`; this is the shape of each frame. `type` is the SSE event name (a
 * `heartbeat` on connect and every 30s), `data` its JSON-encoded payload.
 */
export const SseFrameResponse = defineResponseSchema(
  'SseFrame',
  z.object({
    type: z.string().describe('SSE event name (SSE_EVENTS), e.g. heartbeat or notification:new'),
    data: z.string().describe('JSON-encoded payload of the event'),
  }),
);
