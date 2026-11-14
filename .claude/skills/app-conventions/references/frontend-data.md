---
owner: foundation
sources:
  - packages/appshore/web-core/src/shared/lib/api/client.ts#apiClient
  - packages/appshore/web-core/src/shared/lib/api/client.ts#apiFetchRaw
  - packages/appshore/web-core/src/shared/constants/query-keys.ts#queryKeys
  - packages/appshore/web-core/src/shared/config/query-tiers.ts#QUERY_TIERS
  - packages/appshore/web-core/src/shared/config/query-tiers.ts#CONDITIONAL_POLL_INTERVAL_MS
  - packages/appshore/web-core/src/shared/realtime/invalidation-map.ts#SSE_INVALIDATION_MAP
  - packages/appshore/web-core/src/shared/realtime/use-sse-event.ts#useSseEvent
  - packages/appshore/web-core/src/shared/hooks/use-entity-deep-link.ts#useEntityDeepLink
  - packages/shared-types/src/infrastructure/sse-events.ts#SSE_EVENTS
  - packages/shared-types/src/ai/assistant-stream.schema.ts#STREAM_FRAME
  - apps/backend/src/platform-glue/sse/domain-event-sse-bridge.service.ts#DOMAIN_TO_SSE
  - apps/backend/src/domains/ai/assistant/assistant.service.ts#streamFrameOf
  - apps/web/src/features/platform/ai-chat/lib/stream-frames.ts#dispatchFrame
  - apps/web/src/features/platform/ai-chat/lib/chat-error.ts#chatRequestError
  - apps/web/src/features/platform/ai-chat/components/cards/ConfirmationCard.tsx#ConfirmationCard
  - apps/web/src/features/platform/api-keys/api.ts#apiKeysApi
  - apps/web/src/features/platform/api-keys/hooks/use-tenant-api-keys.ts#useTenantApiKeys
  - apps/web/src/features/auth/store.ts#useAuthStore
guards:
  - api-client-success.test.ts
  - api-client-errors.test.ts
  - stream-frames.test.ts
  - confirmation-card.test.tsx
  - domain-event-sse-bridge.service.spec.ts
  - web-status-casing.spec.ts
  - ui-grammar-guard.test.ts
  - chat-error.test.ts
examples:
  - UPPER_SNAKE_CASE
  - queryClient.prefetchQuery
---

# Frontend data: shared types, the API layer, query and mutation hooks, query keys, SSE, URL state, stores, prefetch

How a screen gets and changes server data. The list kit (`useCursorList`, `useListParams`) is in
[`frontend-lists.md`](frontend-lists.md); how a mutation's error reaches the person is in
[`forms-and-sheets.md`](forms-and-sheets.md). The reference is `apps/web/src/features/platform/api-keys/`.

## Rules

### Types

- An entity type is never defined in the web app: re-export it from `@app/shared-types` in the feature's `types.ts`
  or `api.ts`. Only frontend shapes (form state, props, a list row's extra fields) are local.
  [review-only: no spec finds a hand-copied entity type]
- A filter, payload or select value sends the canonical `UPPER_SNAKE_CASE` enum value from the generated mirror in
  `@app/shared-types`, never a lowercase or hand-narrowed literal next to an enum-typed field.
  [guard: web-status-casing.spec.ts]

### The API layer

- Every call goes through `apiClient` from `@appshore/web-core/shared/lib/api`: it carries the bearer token, the
  request id and the one-shot refresh on a 401. A feature's calls are one object (`apiKeysApi.rotate(id)`), not a
  class; the return type is given (`apiClient<CursorList<T>>(…)`). [guard: api-client-success.test.ts]
- A download (a PDF, an export) uses `apiFetchRaw`, which returns the raw `Response` with the same auth and refresh.
  Never a raw `fetch()` with a hand-built bearer header (the grammar guard holds it on settings and admin pages).
  [guard: api-client-success.test.ts, ui-grammar-guard.test.ts]
- A 204, or a 200, 201 or 202 with an empty body, resolves to `undefined`: type the call `apiClient<void>(…)` and do
  not read it. [guard: api-client-success.test.ts]
- A mutation answers the resource as it is now (no `{ success: true }`): type it as the resource, and write it into
  the cache or invalidate rather than fetch it again. [review-only: needs reading]
- An error is an `ApiError` carrying the envelope: read it with the error utils, never `error.message` from a body.
  [guard: api-client-errors.test.ts]

### Query keys and query hooks

- Every key comes from `queryKeys` (`packages/appshore/web-core/src/shared/constants/query-keys.ts`): a namespace per
  domain with a `root` and its sub-keys. A product adds its namespaces there, never a key inline in a hook.
  [review-only: no spec scans for inline keys]
- List and detail keys have distinct segments (`[ns, 'list', params]`, `[ns, 'detail', id]`). With `[ns, params]` and
  `[ns, id]` an empty list and a closed detail sheet hash to the same key and the list's data leaks into the detail.
  [review-only: no spec reads key shapes]
- A key holds every input of its query: a changed filter is a new key, so a new list. Normalize URL params into a
  memoized object before they go into a key. [review-only: needs reading]
- No hand-written `staleTime` or `refetchInterval`: the defaults in `providers.tsx` cover SSE-backed data; deviate only
  by spreading `QUERY_TIERS.OPERATIONAL` (refetch on focus), `STATIC` (reference data) or `ACTIVE_POLL` (no SSE
  coverage); a poll that runs only while work is in flight uses `CONDITIONAL_POLL_INTERVAL_MS`.
  [review-only: no spec scans query options]
- `enabled` gates a query that waits for an id, a tab (the hook takes `{ enabled = false }`, the page flips it) or a
  permission. `select` derives a smaller shape. [review-only: needs reading]

### Mutation hooks

- Every mutation has a success toast and an error toast: `showSuccess(…)` in `onSuccess`, and `showError(title,
extractErrorMessage(error))` in `onError`. Leaving out `onError` hands it to the global `MutationCache` fallback;
  do that only where a generic message is enough, and check the toast appears.
  [review-only: no spec follows a mutation to its toast]
- `onSuccess` invalidates the namespace's `root` (or writes the returned resource into the cache).
  [review-only: needs reading]
- An optimistic update (`onMutate` with a snapshot, restored in `onError`, invalidated in `onSettled`) is for a
  low-risk toggle only (acknowledge, dismiss, pin). [review-only: needs judgement]
- Never put a whole `useQuery()` or `useMutation()` result in an effect's dependency array: it is a new object each
  render and the effect loops. Depend on `mutation.mutate`, `mutation.reset` or a primitive field.
  [review-only: lint's react-hooks rule only warns, and does not see an identity that changes every render]
- When several entry points on one page (a create sheet, a detail panel, a bulk dialog) refresh the same data, the
  page owns one refresh callback and passes it down; each child still owns its mutation and toasts.
  [review-only: needs reading]

### Real time (SSE)

- The backend bridges a domain event to an SSE event; the web provider receives it and invalidates the keys listed
  for it in `SSE_INVALIDATION_MAP` (`packages/appshore/web-core/src/shared/realtime/invalidation-map.ts`), whose
  values are `queryKeys` entries, never literal arrays. [guard: domain-event-sse-bridge.service.spec.ts]
- A new real-time event has four touchpoints: the registry entry (`APP_EVENT_REGISTRY`), the `DOMAIN_TO_SSE` entry in
  `apps/backend/src/platform-glue/sse/domain-event-sse-bridge.service.ts`, the constant and its payload schema in
  `packages/shared-types/src/infrastructure/sse-events.ts`, and the map entry. Backend detail is in
  [`events-and-outbox.md`](events-and-outbox.md). [guard: domain-event-sse-bridge.service.spec.ts]
- Prefer the map. Use `useSseEvent(type, handler)` only when one event must invalidate three or more unrelated trees,
  when the payload picks the keys, or for a side effect (a sound, a browser notification).
  [review-only: needs judgement]

### The assistant's chat stream

- The chat routes stream one frame per line, a two-character code and its payload; the codes live once in
  `STREAM_FRAME` (`packages/shared-types/src/ai/assistant-stream.schema.ts`). Read the stream only through
  `apps/web/src/features/platform/ai-chat/lib/stream-frames.ts` (`readFrames`, `dispatchFrame`), never inline.
  [review-only: no spec finds a second frame parser]
- A frame with an unknown code, or a payload that does not parse, is skipped: the web and the backend deploy
  separately and either may be ahead. A new frame adds its code to `STREAM_FRAME`, a case in `dispatchFrame`, a
  backend case in `streamFrameOf`, and a test that an older reader skips it. [guard: stream-frames.test.ts]
- A refusal before the stream starts is the error envelope (`chatRequestError`); after it starts it is one `x:` frame:
  show the partial answer, then the `detail` (`failedTurnText`). [guard: chat-error.test.ts, stream-frames.test.ts]
- The confirm card is the server's card: `ConfirmationCard` shows only what the frame carries (`action`,
  `description`, the exact `args`), never model prose. Confirm and Cancel appear only on the card the agent waits on
  and send that card's `toolCallId` and `runId`; a 409 means it was already answered or expired, so nothing ran.
  [guard: confirmation-card.test.tsx]

### URL state and stores

- URL state is for what a link should restore: the active tab (`?tab=`), a deep link into a sheet (`?open=` or
  `useEntityDeepLink`'s `?entityType=&entityId=`), and a list's status, search, sort, dates and filters (through
  `useListParams`, never by hand). A paging cursor is never in the URL. [review-only: needs reading]
- A one-shot param is read, acted on, then removed with `history.replaceState` or `router.replace`, so a refresh does
  not fire it again. `useSearchParams()` needs a `<Suspense>` boundary above it. [review-only: needs reading]
- Server state lives only in TanStack Query, never mirrored into Zustand or component state. Zustand is for UI state
  that outlives a component (the session in `useAuthStore`, chat layout, onboarding, preferences), one store per
  feature in its `store.ts`; a persisted store's name comes from `STORAGE_KEYS`. Everything else is `useState`.
  [review-only: needs reading]

### Prefetch

- Prefetch a detail on hover or click intent (`queryClient.prefetchQuery` with the same key and function the detail
  hook uses), so the sheet opens with data. [review-only: needs judgement]

## Recipe: a read hook and a mutation hook

From `apps/web/src/features/platform/api-keys/`. The API object, typed with `@app/shared-types`:

```typescript
export const apiKeysApi = {
  listTenant: (cursor?: string): Promise<CursorList<TenantApiKeyListItem>> =>
    apiClient<CursorList<TenantApiKeyListItem>>(
      `/api-keys/admin/tenant${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  revoke: (id: number): Promise<ApiKeyResponse> =>
    apiClient<ApiKeyResponse>(`/api-keys/${id}/revoke`, { method: 'POST' }),
};
```

The hooks, trimmed, from `apps/web/src/features/platform/api-keys/hooks/use-tenant-api-keys.ts`:

```typescript
export function useTenantApiKeys() {
  return useCursorList<TenantApiKeyListItem>({
    queryKey: queryKeys.apiKeys.list(),
    queryFn: (cursor) => apiKeysApi.listTenant(cursor),
  });
}

export function useRevokeApiKeyAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiKeysApi.revoke(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys.root });
      showSuccess('API key revoked');
    },
    onError: (err: Error) => showError(extractErrorMessage(err) || "Couldn't revoke the key"),
  });
}
```

1. Add the namespace to `queryKeys` (`root`, `list(params)`, `detail(id)`).
2. Write the API object; take the public id (a string) in a path. The numeric `id` above is one of the API key
   routes the ID boundary allowlists; a new aggregate never takes one.
3. Write the read hook over `useCursorList` (a growing list) or `useQuery` (a detail, with `enabled: !!id`).
4. Write one mutation hook per write: invalidate the `root`, toast both outcomes.
5. If the data changes from elsewhere, add the SSE touchpoints above.

## Flag in review

- An inline `queryKey` array, or list and detail keys without distinct segments.
- A hand-written `staleTime`, `refetchInterval` or polling interval.
- A mutation with no error toast and no check that the global fallback fires.
- Server data copied into a store or into `useState`.
- A one-shot URL param that is not cleaned up after use.
- A raw `fetch()` for an authenticated call, or a body read for `message`.
- A local copy of an entity type from `@app/shared-types`.
