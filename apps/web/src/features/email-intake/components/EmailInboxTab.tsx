'use client';

import { useState } from 'react';
import { EmailThreadList } from './EmailThreadList';
import { EmailInboxSettingsSheet } from './EmailInboxSettingsSheet';

interface EmailInboxTabProps {
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
}

export function EmailInboxTab({ settingsOpen: controlledOpen, onSettingsOpenChange }: EmailInboxTabProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined && onSettingsOpenChange !== undefined;
  const settingsOpen = isControlled ? controlledOpen : internalOpen;
  const setSettingsOpen = isControlled ? onSettingsOpenChange : setInternalOpen;

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <EmailThreadList />
      <EmailInboxSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
