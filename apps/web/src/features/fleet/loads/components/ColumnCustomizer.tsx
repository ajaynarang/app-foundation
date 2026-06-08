'use client';

import { Settings2 } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@sally/ui/components/ui/dropdown-menu';
import type { TableColumnDef } from './LoadsTableView';

interface ColumnCustomizerProps {
  columns: TableColumnDef[];
  visibleKeys: Set<string>;
  onToggle: (key: string) => void;
  onReset: () => void;
}

export function ColumnCustomizer({ columns, visibleKeys, onToggle, onReset }: ColumnCustomizerProps) {
  const toggleableColumns = columns.filter((col) => !col.locked);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Toggle columns">
          <Settings2 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {toggleableColumns.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.key}
            checked={visibleKeys.has(col.key)}
            onCheckedChange={() => onToggle(col.key)}
            onSelect={(e) => e.preventDefault()}
          >
            {col.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onReset} onSelect={(e) => e.preventDefault()}>
          Reset to defaults
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
