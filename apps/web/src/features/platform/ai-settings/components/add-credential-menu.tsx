'use client';

import { Plus } from 'lucide-react';
import { Button } from '@app/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@app/ui/components/ui/dropdown-menu';
import type { AiCredentialType, AiRetentionPolicy } from '@app/shared-types';
import { CREDENTIAL_TYPE_META, offeredCredentialTypes } from '../constants';

export interface AddCredentialMenuProps {
  policy: AiRetentionPolicy;
  onSelect: (type: AiCredentialType) => void;
}

/** The owner's Add credential menu, in recommendation order. Under zero retention only Anthropic and Bedrock. */
export function AddCredentialMenu({ policy, onSelect }: AddCredentialMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Add credential
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {offeredCredentialTypes(policy).map((type) => (
          <DropdownMenuItem key={type} onSelect={() => onSelect(type)}>
            <div>
              <p className="text-sm">{CREDENTIAL_TYPE_META[type].label}</p>
              <p className="text-xs text-muted-foreground">{CREDENTIAL_TYPE_META[type].blurb}</p>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
