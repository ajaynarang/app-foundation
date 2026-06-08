import type { ReactNode } from 'react';

interface InfoItemProps {
  label: string;
  value?: string | null;
  icon?: ReactNode;
  mono?: boolean;
}

export function InfoItem({ label, value, icon, mono }: InfoItemProps) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className={`text-sm text-foreground mt-0.5 flex items-center gap-1 ${mono ? 'font-mono' : ''}`}>
        {icon}
        {value != null && value !== '' ? value : <span className="text-muted-foreground">&mdash;</span>}
      </p>
    </div>
  );
}
