/**
 * The Mastra `RequestContext` key under which a call site passes the model it resolved for the tenant
 * (`AiRouteResolver.resolve(...).languageModel(alias)`). Agents own no model: `mastra.provider.ts` reads this key per
 * request and throws when it is missing, so an agent can never run on a default provider.
 */
export const REQUEST_MODEL_KEY = 'resolvedLanguageModel';
