'use client';

import { useState, useMemo, useCallback } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/shared/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { useCustomers } from '../hooks/use-customers';
import { CreateCustomerSheet } from './create-customer-sheet';
import type { Customer } from '@sally/shared-types';

interface CustomerPickerProps {
  /** Currently selected customer ID (number) */
  value: number | null;
  /** Called when a customer is selected */
  onChange: (customerId: number, customerName: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Additional className for the trigger button */
  className?: string;
  /** Whether the picker is disabled */
  disabled?: boolean;
}

export function CustomerPicker({
  value,
  onChange,
  placeholder = 'Select customer...',
  className,
  disabled,
}: CustomerPickerProps) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: allCustomers } = useCustomers();
  const activeCustomers = useMemo(() => (allCustomers ?? []).filter((c) => c.status !== 'INACTIVE'), [allCustomers]);

  const selected = activeCustomers.find((c) => c.id === value);

  const handleListWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const viewport = e.currentTarget.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    const multiplier = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? viewport.clientHeight : 1;
    viewport.scrollTop += e.deltaY * multiplier;
  }, []);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', className)}
          >
            <span className="truncate">{selected ? selected.companyName : placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search customers..." />
            <CommandList onWheel={handleListWheel}>
              <CommandEmpty>No customer found.</CommandEmpty>
              <ScrollArea className="h-[200px]" type="always">
                <CommandGroup>
                  {activeCustomers.map((customer) => (
                    <CommandItem
                      key={customer.id}
                      value={customer.companyName}
                      onSelect={() => {
                        onChange(customer.id, customer.companyName);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', value === customer.id ? 'opacity-100' : 'opacity-0')} />
                      {customer.companyName}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </ScrollArea>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    setCreateOpen(true);
                  }}
                  className="text-muted-foreground"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add new customer
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <CreateCustomerSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(customer: Customer) => {
          onChange(customer.id, customer.companyName);
        }}
      />
    </>
  );
}
