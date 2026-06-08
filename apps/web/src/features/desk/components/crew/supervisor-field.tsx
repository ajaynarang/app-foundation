'use client';

import { Label } from '@/shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';

import { useEligibleSupervisors } from '../../hooks/use-agents';
import type { AgentSupervisor } from '../../types';

interface SupervisorFieldProps {
  supervisor: AgentSupervisor | null;
  /**
   * Pending override — the id the user picked since opening the sheet, or
   * explicit `null` when they reset to Unassigned. `undefined` means no
   * pending change. Reflected in the dropdown trigger label so the sheet
   * previews the selection before Save.
   */
  pendingSupervisorUserId?: number | null;
  canReassign: boolean;
  onChange: (nextUserId: number | null) => void;
  disabled?: boolean;
}

const UNASSIGNED = '__unassigned__';

/**
 * Supervisor picker for the agent sheet Overview tab.
 * - Owner/admin: dropdown of eligible users (OWNER/ADMIN/DISPATCHER).
 * - Everyone else: read-only "FirstName LastName · Role" text.
 */
export function SupervisorField({
  supervisor,
  pendingSupervisorUserId,
  canReassign,
  onChange,
  disabled,
}: SupervisorFieldProps) {
  if (!canReassign) {
    return (
      <div className="space-y-1">
        <Label className="text-sm font-medium">Supervisor</Label>
        {supervisor ? (
          <p className="text-sm text-foreground">
            {supervisor.firstName} {supervisor.lastName}{' '}
            <span className="text-muted-foreground">· {prettyRole(supervisor.role)}</span>
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">Unassigned</p>
        )}
        <p className="text-xs text-muted-foreground">
          Logged on every action this agent takes. Approval routing uses this — supervisors see their agents&apos;
          handoffs first.
        </p>
      </div>
    );
  }

  return (
    <SupervisorDropdown
      supervisor={supervisor}
      pendingSupervisorUserId={pendingSupervisorUserId}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

function SupervisorDropdown({
  supervisor,
  pendingSupervisorUserId,
  onChange,
  disabled,
}: {
  supervisor: AgentSupervisor | null;
  pendingSupervisorUserId?: number | null;
  onChange: (nextUserId: number | null) => void;
  disabled?: boolean;
}) {
  const { data, isLoading } = useEligibleSupervisors();
  const users = data ?? [];
  const hasUsers = users.length > 0;

  // Effective id = pending (if user picked) else server value.
  const effectiveId: number | null =
    pendingSupervisorUserId !== undefined ? pendingSupervisorUserId : (supervisor?.id ?? null);
  const current = effectiveId === null ? UNASSIGNED : String(effectiveId);

  return (
    <div className="space-y-1">
      <Label className="text-sm font-medium">Supervisor</Label>
      {isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <Select
          value={current}
          disabled={disabled}
          onValueChange={(v) => onChange(v === UNASSIGNED ? null : Number(v))}
        >
          <SelectTrigger className="h-9 w-full text-sm">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={String(u.id)}>
                {u.firstName} {u.lastName} · {prettyRole(u.role)}
              </SelectItem>
            ))}
            {!hasUsers && (
              <div className="px-2 py-1.5 text-xs italic text-muted-foreground">No other users available.</div>
            )}
          </SelectContent>
        </Select>
      )}
      <p className="text-xs text-muted-foreground">
        Logged on every action this agent takes. Approval routing uses this — supervisors see their agents&apos;
        handoffs first.
      </p>
    </div>
  );
}

function prettyRole(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}
