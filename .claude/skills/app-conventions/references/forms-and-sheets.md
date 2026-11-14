---
owner: foundation
status: interim
pending: F1
sources:
  - packages/ui/src/components/ui/form-sheet.tsx#FormSheet
  - packages/ui/src/components/ui/button.tsx
  - packages/ui/src/lib/toast.ts#showMutationError
  - packages/appshore/web-core/src/shared/lib/error-utils.ts#extractErrorMessage
  - packages/appshore/web-core/src/shared/lib/error-utils.ts#extractFieldErrors
  - packages/appshore/web-core/src/shared/lib/error-utils.ts#extractErrorCode
  - packages/appshore/web-core/src/shared/lib/sentry.ts#captureError
  - packages/appshore/web-core/src/shared/hooks/use-network-status.ts#useNetworkStatus
  - apps/web/src/app/providers.tsx#Providers
  - apps/web/src/app/error.tsx
  - apps/web/src/app/global-error.tsx
  - apps/web/src/app/not-found.tsx
  - apps/web/src/features/auth/components/login-form.tsx
  - apps/web/src/features/webhooks/components/create-webhook-sheet.tsx
guards:
  - form-sheet.test.tsx
  - error-utils.test.ts
  - ui-grammar-guard.test.ts
  - plan-upgrade.test.ts
---

# Forms and sheets: sheet, dialog or alert dialog, `FormSheet`, validation, the feedback layers, the error architecture

Moved from the old frontend skill; condensed with its recipe in its finish pull request. The API error shape itself
is in [`errors.md`](errors.md); the mutation hooks are in [`frontend-data.md`](frontend-data.md).

## Rules

### Sheet, dialog or alert dialog

- A Sheet is for create, edit and detail views (four fields or more); a Dialog for a quick action (one to four
  fields); an AlertDialog only to confirm a destructive action. [review-only: needs reading]
- A form sheet is `FormSheet` from `@app/ui`: `mode` is `edit` or `view`; `onSubmit` and `isSubmitting` drive the
  footer; `size` (`sm` or `md`) fixes the width, or `entityType` shows the size controls and remembers the width;
  `titleNode` holds rich title content and `headerActions` puts buttons before pin and close. Never a hand-built
  header with its own close button. [guard: form-sheet.test.tsx]
- An edit sheet blocks an outside click; a view sheet closes on outside click, Escape and the X. An edit sheet focuses
  its first field on open, and Cmd or Ctrl+Enter submits.
  [review-only: `FormSheet` does this, and form-sheet.test.tsx does not yet cover it]
- Widths: small `w-full sm:max-w-lg` (four to eight fields), medium `w-full sm:max-w-2xl` (more, and detail views).
  [review-only: needs reading]

### Where a sheet's actions go

- A sheet's actions live in one sticky footer row: the overflow menu bottom-left, the primary action (filled)
  bottom-right, secondary actions (outline) just left of it. The header carries identity only: title, status, close.
  [review-only: no spec reads sheet layouts]
- The overflow holds rare and destructive lifecycle actions and is hidden when it would be empty. A destructive action
  that would be the sheet's only action is a visible `variant="destructive"` button bottom-right instead.
  [review-only: needs reading]
- Edit governs form fields only (a draft with Save and Cancel). An operational action (assign, approve, void) is not
  gated by Edit; it is enabled when valid now, disabled with a tooltip that names the fix when a condition the person
  can meet blocks it, and hidden when it can never apply to the record. A role that may not act sees no control.
  [review-only: needs judgement]
- Every destructive action confirms through an AlertDialog first, even a small trash icon in a table.
  [review-only: no spec follows a destructive action to its confirmation]

### Forms and validation

- A simple form is `useState` with a check on submit; an auth or multi-step form is `react-hook-form` with a schema
  resolver (`standardSchemaResolver`, as in `apps/web/src/features/auth/components/login-form.tsx`). A form schema
  matches the `@app/shared-types` schema it submits. [review-only: needs reading]
- Validation errors show inline, under the field. A 400's `fieldErrors` (`extractFieldErrors(error)`) map back onto
  the fields (`setError` with `react-hook-form`). [guard: error-utils.test.ts]
- A submit button takes `loading={mutation.isPending}`, never a hand-placed `Loader2`.
  [review-only: the grammar guard bans a spinner as a page's loading state on settings and admin pages, not in a button]

### The five feedback layers

- L1 the route progress bar (automatic); L2 the button's `loading` prop on a mutation; L3 a success and an error toast
  on every mutation (`showSuccess`, `showError` from `@app/ui`); L4 a `Skeleton` the size of the loaded layout for
  `isLoading`, never a spinner and never `null`; L5 an optimistic update for a low-risk toggle only.
  [review-only: no spec follows a mutation to its toast or a query to its skeleton]
- A skeleton matches the final layout's footprint (eight rows for eight rows, `h-24` for a 96px card): a layout shift
  on load is a bug. [review-only: needs looking]

### Errors

- `extractErrorMessage(error)` gives the copy to show (it reads the envelope's `detail`; a 403, 409 or 429 shows the
  backend's own `detail`); `extractFieldErrors(error)` the field map; `extractErrorCode(error)` the machine code to
  branch on. Never show a raw `error.message` and never branch on copy. [guard: error-utils.test.ts]
- A mutation's `onError` calls `showError(title, extractErrorMessage(error))`; leaving it out hands the error to the
  global `MutationCache` fallback in `apps/web/src/app/providers.tsx`, which shows `showMutationError` or, for a plan
  gate's 403, the upgrade prompt. [guard: plan-upgrade.test.ts]
- Error boundaries: `app/global-error.tsx` (the root layout crashed; owns its `<html>`), `app/error.tsx` (a route
  segment; the layout survives), `app/not-found.tsx` (404). Each is `'use client'`, reports through `captureError()`
  (`@appshore/web-core/shared/lib/sentry`), shows the stack only in development, and always leaves a way to navigate
  away. [review-only: needs reading]
- Offline state is `useNetworkStatus()` and the banner in the root layout. [review-only: needs reading]

## Flag in review

- A Dialog with more than four fields, or an AlertDialog for something that is not destructive.
- A destructive action with no confirmation.
- A sheet with buttons in its header, or an empty overflow menu.
- A disabled control with no tooltip saying why.
- A raw `error.message` in a toast.
- A spinner where a skeleton belongs, or a skeleton of a different size than what loads.
