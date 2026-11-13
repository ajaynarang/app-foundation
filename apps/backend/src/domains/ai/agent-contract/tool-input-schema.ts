import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * The confirmation replay token every non-read tool accepts. Advertised in `tools/list` so an external agent
 * (Claude, ChatGPT, Cursor) can complete the two-step confirm flow on its own, with no hand-coded knowledge of it.
 */
export const CONFIRM_TOKEN_PARAM = '_confirmToken';

const CONFIRM_TOKEN_SCHEMA = {
  type: 'string',
  description:
    'OPTIONAL. Leave it out on the first call. A write answers with a token instead of running. `{"status":"approval_required","token":"…","approvalUrl":"…"}`: a person must approve it in the app first; share `approvalUrl` with them. `{"status":"hitl_required","stepUpRequired":true,…}`: the person you act for must confirm with their PIN at `approvalUrl` (signed in to the app). `{"status":"hitl_required","stepUpRequired":false}`: nothing to wait for. Then repeat the call with the same arguments plus `_confirmToken` set to that token. While a person has not decided, the retry answers `approval_pending` (wait and retry); `approval_denied` means start over. A token is single-use, expires, and is bound to this tool and these exact arguments.',
};

/**
 * A tool's MCP `inputSchema`, as `tools/list` serves it: the tool's zod parameters as JSON Schema, every
 * `_`-prefixed (server-injected) property stripped, and the replay token added. One function, so what an agent is
 * told and what the pipeline accepts cannot disagree: the pipeline drops every `_` key a caller sends, too.
 */
export function toolInputSchema(parameters: unknown): Record<string, unknown> {
  let schema: Record<string, unknown> = { type: 'object', properties: {} };
  if (parameters && typeof parameters === 'object' && 'shape' in (parameters as Record<string, unknown>)) {
    schema = zodToJsonSchema(parameters as never);
  }
  if (!schema.properties || typeof schema.properties !== 'object') schema.properties = {};
  const props = schema.properties as Record<string, unknown>;
  for (const name of Object.keys(props)) {
    if (name.startsWith('_')) delete props[name];
  }
  if (Array.isArray(schema.required)) {
    schema.required = (schema.required as string[]).filter((r) => !r.startsWith('_'));
  }
  props[CONFIRM_TOKEN_PARAM] = CONFIRM_TOKEN_SCHEMA;
  return schema;
}
