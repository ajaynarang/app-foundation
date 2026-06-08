'use client';

import { useCallback } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@app/ui/components/ui/command';
import { Sparkles } from 'lucide-react';
import { useSallyStore } from '../store';
import { useSallyCapabilities } from '../hooks/use-sally-capabilities';

const CHAT_INPUT_LABEL = 'Ask anything';

interface SallyCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * How to deliver a picked prompt back to the surface that opened the
   * palette. Defaults to setDraftInput + expandStrip, which fills the chat
   * input and opens the floating panel. Pass a handler to deliver the prompt
   * to a different surface instead.
   */
  onPickPrompt?: (text: string) => void;
}

export function SallyCommandPalette({ open, onOpenChange, onPickPrompt }: SallyCommandPaletteProps) {
  const setDraftInput = useSallyStore((s) => s.setDraftInput);
  const expandStrip = useSallyStore((s) => s.expandStrip);
  const { data, isLoading } = useSallyCapabilities();

  const quickActions = data?.quickActions ?? [];
  const categories = data?.categories ?? [];

  // Every row drops the prompt into the input so the user can edit before
  // sending. We deliberately do not auto-fire — accidental clicks shouldn't
  // burn a Sally turn, and quick-action templates may need tweaking.
  const draftPrompt = (text: string) => {
    if (onPickPrompt) {
      onPickPrompt(text);
    } else {
      setDraftInput(text);
      expandStrip();
    }
    onOpenChange(false);
  };

  // Restore focus to the Sally chat textarea when the palette closes.
  // Without this, dismissing via Esc / outside-click drops focus on <body>,
  // forcing the user to reach for the mouse to start typing again.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      onOpenChange(next);
      if (!next) {
        // Defer past Radix's own focus restoration — running synchronously
        // here would race with the dialog's onCloseAutoFocus.
        setTimeout(() => {
          const input = document.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${CHAT_INPUT_LABEL}"]`);
          input?.focus();
        }, 0);
      }
    },
    [onOpenChange],
  );

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput placeholder="Search what the assistant can do…" />
      <CommandList>
        <CommandEmpty>{isLoading ? 'Loading…' : 'No matches. Try a different word.'}</CommandEmpty>

        {quickActions.length > 0 && (
          <CommandGroup heading="Quick actions">
            {quickActions.map((action) => (
              <CommandItem
                key={action.id}
                value={`${action.label} ${action.hint}`}
                onSelect={() => draftPrompt(action.prompt)}
              >
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate">{action.label}</span>
                  <span className="text-xs text-muted-foreground truncate">{action.hint}</span>
                </div>
                <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {categories.map((category) => (
          <div key={category.title}>
            <CommandSeparator />
            <CommandGroup heading={category.title}>
              {category.items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.name} ${item.description} ${item.example}`}
                  onSelect={() => draftPrompt(item.example)}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
                    <span className="text-xs text-muted-foreground truncate">{item.example}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>

      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <div className="flex items-center gap-3 text-2xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↑</kbd>
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↵</kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">esc</kbd>
            close
          </span>
        </div>
      </div>
    </CommandDialog>
  );
}
