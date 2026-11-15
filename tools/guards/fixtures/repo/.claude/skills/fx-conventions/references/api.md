---
owner: foundation
sources:
  - apps/api/src/widget.ts#listWidgets
guards:
  - apps/api/src/widget.spec.ts
  - script:guards
examples:
  - ExampleThing
---

# API

## Rules

- A list returns `listWidgets` output; `ExampleThing` is only an illustration. [guard: apps/api/src/widget.spec.ts]

## Recipe

Copied from `apps/api/src/widget.ts`:

```ts
export class WidgetService {
  listWidgets() {
    return [];
  }
}
// one
// two
// three
// four
// five
```
