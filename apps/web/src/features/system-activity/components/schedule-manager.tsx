'use client';

import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Switch } from '@sally/ui/components/ui/switch';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Badge } from '@sally/ui/components/ui/badge';
import { Pencil, Check, X } from 'lucide-react';
import { useAdminSchedules, useUpdateSchedule } from '../hooks';
import { CATEGORY_DISPLAY_NAMES, TYPE_DISPLAY_NAMES } from '../types';
import type { JobSchedule } from '../api';

function cronToHuman(cron?: string | null, everyMs?: number | null): string {
  if (everyMs) {
    if (everyMs < 60_000) return `Every ${Math.round(everyMs / 1000)}s`;
    if (everyMs < 3_600_000) return `Every ${Math.round(everyMs / 60_000)} min`;
    return `Every ${Math.round(everyMs / 3_600_000)} hours`;
  }
  if (!cron) return 'Manual';
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;
  const [minute, hour] = parts;
  if (minute.startsWith('*/') && hour === '*') {
    const n = parseInt(minute.slice(2), 10);
    return n === 1 ? 'Every minute' : `Every ${n} min`;
  }
  if (minute === '0' && hour.startsWith('*/')) {
    return `Every ${parseInt(hour.slice(2), 10)} hours`;
  }
  if (minute === '0' && /^\d+$/.test(hour)) {
    const h = parseInt(hour, 10);
    const period = h >= 12 ? 'PM' : 'AM';
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `Daily at ${display} ${period}`;
  }
  return cron;
}

function ScheduleRow({ schedule }: { schedule: JobSchedule }) {
  const updateMutation = useUpdateSchedule();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const handleToggle = (checked: boolean) => {
    updateMutation.mutate({ id: schedule.id, data: { isEnabled: checked } });
  };

  const handleEdit = () => {
    setEditValue(schedule.scheduleType === 'cron' ? (schedule.pattern ?? '') : (schedule.intervalMs?.toString() ?? ''));
    setEditing(true);
  };

  const handleSave = () => {
    const data = schedule.scheduleType === 'cron' ? { pattern: editValue } : { intervalMs: parseInt(editValue, 10) };
    updateMutation.mutate({ id: schedule.id, data });
    setEditing(false);
  };

  const displaySchedule = cronToHuman(schedule.pattern, schedule.intervalMs);

  return (
    <TableRow>
      <TableCell className="font-medium">{CATEGORY_DISPLAY_NAMES[schedule.category] ?? schedule.category}</TableCell>
      <TableCell>{TYPE_DISPLAY_NAMES[schedule.jobType] ?? schedule.jobType}</TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs">
          {schedule.scheduleType}
        </Badge>
      </TableCell>
      <TableCell>
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="h-8 w-40"
              placeholder={schedule.scheduleType === 'cron' ? '*/15 * * * *' : 'ms interval'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') setEditing(false);
              }}
              autoFocus
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleSave}
              loading={updateMutation.isPending}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm">{displaySchedule}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleEdit}>
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        )}
      </TableCell>
      <TableCell>
        <Switch checked={schedule.isEnabled} onCheckedChange={handleToggle} disabled={updateMutation.isPending} />
      </TableCell>
    </TableRow>
  );
}

export function ScheduleManager() {
  const { data: schedules, isLoading } = useAdminSchedules();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!schedules?.length) {
    return <p className="text-muted-foreground text-sm py-8 text-center">No schedules configured.</p>;
  }

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            <TableHead>Job Type</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Enabled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {schedules.map((schedule) => (
            <ScheduleRow key={schedule.id} schedule={schedule} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
