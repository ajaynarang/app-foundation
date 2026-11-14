---
owner: foundation
sources:
  - packages/ui/src/components/ui/form-sheet.tsx#FormSheet
  - packages/ui/src/components/ui/form-sheet.tsx#SheetKeyboardHint
  - packages/ui/src/components/ui/button.tsx
  - packages/ui/src/lib/toast.ts#showSuccess
  - packages/ui/src/lib/toast.ts#showError
  - packages/ui/src/lib/toast.ts#showMutationError
  - packages/appshore/web-core/src/shared/lib/error-utils.ts#extractErrorMessage
  - packages/appshore/web-core/src/shared/lib/error-utils.ts#extractFieldErrors
  - packages/appshore/web-core/src/shared/lib/error-utils.ts#extractErrorCode
  - packages/appshore/web-core/src/shared/lib/plan-upgrade.ts#showPlanUpgradePrompt
  - packages/appshore/web-core/src/shared/lib/sentry.ts#captureError
  - packages/appshore/web-core/src/shared/hooks/use-network-status.ts#useNetworkStatus
  - apps/web/src/app/providers.tsx#Providers
  - apps/web/src/app/error.tsx
  - apps/web/src/app/global-error.tsx
  - apps/web/src/app/not-found.tsx
  - apps/web/src/shared/components/common/error-boundary-content.tsx#ErrorBoundaryContent
  - apps/web/src/shared/components/common/network-status-banner.tsx
  - apps/web/src/features/auth/components/login-form.tsx
  - apps/web/src/features/platform/api-keys/components/ApiKeyMintSheet.tsx#ApiKeyMintSheet
guards:
  - form-sheet.test.tsx
  - error-utils.test.ts
  - plan-upgrade.test.ts
  - ui-grammar-guard.test.ts
  - row-actions.test.tsx
---

# Forms and sheets: sheet, dialog or alert dialog, `FormSheet`, validation, the feedback layers, the error architecture

How a person creates, edits and confirms, and how every outcome reaches them. The API error shape itself is in
[`errors.md`](errors.md); the mutation hooks in [`frontend-data.md`](frontend-data.md); row and page actions in
[`ui-grammar.md`](ui-grammar.md). The reference is the API key mint sheet,
`apps/web/src/features/platform/api-keys/components/ApiKeyMintSheet.tsx`.

## Rules

### Sheet, dialog or alert dialog

- A Sheet is for create, edit and detail views (four fields or more); a Dialog for a quick action (one to four
  fields); an AlertDialog only to confirm a destructive action. [review-only: needs reading]
- A side panel is `FormSheet` from `@app/ui/components/ui/form-sheet`: it carries the title header, the pin toggle,
  the close button, the Esc and Cmd+Enter hint, the first-field focus, the sticky footer and the size modes. Never
  compose a raw `Sheet` and `SheetContent` into a side panel, and never hand-build a header with its own close
  button. A raw `Sheet` is for chrome that is not a side panel (a bottom sheet on a phone), with a comment saying
  why. [review-only: several older sheets still compose `SheetContent`; no spec bans it yet]
- `FormSheet` props: `mode` is `edit` (a form, with Save and Cancel) or `view` (a detail); `onSubmit`,
  `isSubmitting`, `submitDisabled` and `submitLabel` drive the footer; `size` (`sm` or `md`) fixes the width, or
  `entityType` shows the size controls and remembers the width per entity; `titleNode` holds rich title content
  (`title` stays the accessible name); `headerActions` puts buttons before pin and close; `footerExtra` adds to the
  footer. [guard: form-sheet.test.tsx]
- An edit sheet ignores a click outside, so typed input is never lost; a view sheet closes on a click outside,
  Escape and the X. The `mode` prop does this: never hand-roll `onInteractOutside`. [guard: form-sheet.test.tsx]
- An edit sheet focuses its first field on open, and Cmd or Ctrl+Enter submits it, except while it is saving or
  `submitDisabled`; a view sheet has no submit shortcut. [guard: form-sheet.test.tsx]
- Widths: `sm` is `w-full sm:max-w-lg` (four to eight fields), `md` is `w-full sm:max-w-2xl` (more, and detail
  views). On a phone every sheet is full screen. [review-only: the size choice needs reading]

### Where a sheet's actions go

- A sheet's actions live in one sticky footer row: rare and destructive lifecycle actions bottom-left (in
  `footerExtra`), the primary action (filled) bottom-right, secondary actions (outline) just left of it. The header
  carries identity only: title, status, close. [review-only: no spec reads sheet layouts]
- An overflow menu is hidden when no item applies; never draw an empty one. A destructive action that would be the
  sheet's only action is a visible destructive button bottom-right instead of a lone ⋯. [review-only: needs reading]
- Edit governs form fields only (a draft with Save and Cancel). An operational action (assign, approve, void) is
  not gated by Edit, and resolves to one of three states: enabled when valid now; disabled with a tooltip that
  names the fix when a condition the person can meet blocks it; hidden when it can never apply to this record. A
  role that may not act sees no control. [review-only: needs judgement]
- Every destructive action confirms through an AlertDialog first, even a small trash icon in a table; the dialog
  names the record and says what is lost. In a row this is `RowActions` with `destructive: true`, whose handler
  opens the dialog. [review-only: no spec follows a destructive action to its confirmation; row-actions.test.tsx
  holds the placement]

### Forms and validation

- A simple form is `useState` with a check on submit; an auth or multi-step form is `react-hook-form` with a schema
  resolver (`standardSchemaResolver`, as in `apps/web/src/features/auth/components/login-form.tsx`). A form schema
  matches the `@app/shared-types` schema it submits. [review-only: needs reading]
- Validation errors show inline, under the field, in the person's words. A rule the screen can check before the
  round trip is checked there and keeps the submit disabled (the mint sheet's "add at least one CIDR"); the server
  still checks it. [review-only: needs reading]
- A 400's `fieldErrors` (`extractFieldErrors(error)`) map back onto the fields (`setError` with `react-hook-form`,
  a field-keyed state map otherwise). [guard: error-utils.test.ts]
- Every control has a `Label` bound to it (`htmlFor` and `id`); a hint under a field is small muted text
  (`text-xs`, `text-muted-foreground`). [review-only: no accessibility spec runs]
- A submit button takes `loading={mutation.isPending}`, never a hand-placed `Loader2`; `FormSheet` does this from
  `isSubmitting`. [review-only: the grammar guard bans a spinner as a page's loading state on settings and admin
  pages, not in a button]
- A secret shown once (a new key, a signing secret) is shown after the create in its own dialog with a copy button,
  says it cannot be shown again, and is never kept in a store or the query cache. [review-only: needs reading]

### The five feedback layers

- L1, the route progress bar, is automatic. L2: the button's `loading` prop on a mutation. L3: a success and an
  error toast on every mutation (`showSuccess`, `showError` from `@app/ui`). L4: a `Skeleton` or a shaped
  `PageLoadingSkeleton` for `isLoading`, never a spinner and never `null`. L5: an optimistic update, for a low-risk
  toggle only. [review-only: no spec follows a mutation to its toast or a query to its skeleton]
- A skeleton matches the final layout's footprint (eight rows for eight rows, `h-24` for a 96px card); a settings
  form uses `PageLoadingSkeleton variant="form"`. A layout shift on load is a bug. [review-only: needs looking]

### Errors

- `extractErrorMessage(error)` gives the copy to show (it reads the envelope's `detail`; a 403, 409 or 429 the
  backend explained shows its own `detail`); `extractFieldErrors(error)` the field map; `extractErrorCode(error)` the
  machine code to branch on. Never show a raw `error.message`, never read a `message` key, and never branch on copy.
  [guard: error-utils.test.ts]
- A mutation's `onError` calls `showError(title, extractErrorMessage(error))` with a title that says what failed.
  Leaving `onError` out hands the error to the global `MutationCache` fallback in `apps/web/src/app/providers.tsx`,
  which shows `showMutationError`, or for a plan gate's 403 (`PLAN_UPGRADE_REQUIRED`, `USER_LIMIT_REACHED`) the
  upgrade prompt; use the fallback only where a generic line is fine. [guard: plan-upgrade.test.ts]
- Error boundaries: `app/global-error.tsx` (the root layout crashed; owns its `<html>`), `app/error.tsx` (a route
  segment; the layout survives; renders `ErrorBoundaryContent`), `app/not-found.tsx` (404, a server component). The
  client boundaries report through `captureError()` (`@appshore/web-core/shared/lib/sentry`), show the stack only in
  development, and always leave a way to navigate away. [review-only: needs reading]
- Offline state is `useNetworkStatus()` and the banner in the root layout
  (`apps/web/src/shared/components/common/network-status-banner.tsx`): an offline warning, a brief "connection
  restored", nothing when online. [review-only: needs reading]

## Recipe: a form sheet

The sheet holds the field state; a new feature puts the mutation in its hooks file and calls its API object
([`frontend-data.md`](frontend-data.md)), where this older sheet still calls `apiClient` inline. Trimmed from
`apps/web/src/features/platform/api-keys/components/ApiKeyMintSheet.tsx`:

```tsx
const mutation = useMutation({
  mutationFn: async (payload: {
    name: string;
    scopes: AgentScope[];
    ipAllowlist: string[];
    rateLimitPerMinute: number;
  }) => apiClient<ApiKeyResponse>('/api-keys', { method: 'POST', body: JSON.stringify(payload) }),
  onSuccess: (data) => {
    qc.invalidateQueries({ queryKey: queryKeys.apiKeys.root });
    showSuccess('API key created — copy the secret before closing');
    setCreated(data);
  },
  onError: (err: Error) => showError("Couldn't create the key", extractErrorMessage(err)),
});

const canSubmit = name.trim().length > 0 && scopes.length > 0 && !needsIpAllowlist && !mutation.isPending;

return (
  <FormSheet
    open={open && !created}
    onOpenChange={(v) => {
      if (!v) {
        reset();
        onOpenChange(false);
      } else {
        onOpenChange(v);
      }
    }}
    title="Create an API key"
    description="Scoped API key for a script, BI tool, or private agent."
    mode="edit"
    size="md"
    onSubmit={handleSubmit}
    submitLabel="Create key"
    submitDisabled={!canSubmit}
    isSubmitting={mutation.isPending}
  >
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="key-name">Name</Label>
        <Input
          id="key-name"
          placeholder="e.g. BI read-only script"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {needsIpAllowlist && <p className="text-xs text-caution-text">Add at least one CIDR before creating the key.</p>}
    </div>
  </FormSheet>
);
```

1. Pick the surface by field count and destructiveness: `FormSheet` for four fields or more, `Dialog` for fewer,
   `AlertDialog` to confirm a destructive action.
2. Write the mutation hook: invalidate the namespace's `root`, `showSuccess`, and `showError` with
   `extractErrorMessage`.
3. Hold the fields in `useState` (or `react-hook-form` for a long form); derive `canSubmit`; show a check the screen
   can make inline, under its field.
4. Render `FormSheet` in `edit` mode with `onSubmit`, `isSubmitting` and `submitDisabled`; a `Label` on every field.
5. On a 400, map `extractFieldErrors(error)` onto the fields; reset the fields when the sheet closes.
6. Look at it at 375 px (full screen) and 1440 px in both themes; try Esc, Cmd+Enter and a click outside.

## Flag in review

- A Dialog with more than four fields, or an AlertDialog for something that is not destructive.
- A side panel built from a raw `Sheet`, or a hand-built header with its own close button.
- A destructive action with no confirmation, or a confirmation that does not name the record.
- A sheet with buttons in its header, or an empty overflow menu.
- A disabled control with no tooltip saying why, or a control a role may not use left visible.
- A raw `error.message` in a toast, a branch on error copy, or a mutation with no error path.
- A spinner where a skeleton belongs, or a skeleton of a different size than what loads.
- A hand-rolled `onInteractOutside` that lets an edit sheet close on an outside click and lose typed input.
- A one-time secret kept in a store or the query cache.
