'use client';

import { ReactNode } from 'react';

interface ResizableSidebarProps {
  children: ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export function ResizableSidebar({ children, defaultWidth = 340 }: ResizableSidebarProps) {
  return (
    <div className="mr-4 flex-shrink-0" style={{ width: `${defaultWidth}px` }}>
      {children}
    </div>
  );
}
