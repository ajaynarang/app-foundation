'use client';

import { useState } from 'react';
import { Plus, Trash2, UserCheck } from 'lucide-react';
import type { OutboundAllowEntry } from '@app/shared-types';
import { Button } from '@app/ui/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@app/ui/components/ui/alert-dialog';
import {
  ListErrorState,
  PageEmptyState,
  PageLoadingSkeleton,
  PageSection,
  RelativeTime,
  RowActions,
} from '@/shared/components/page-chrome';
import { ALLOW_KIND_LABEL } from '../constants';
import { useOutboundAllowList, useRemoveOutboundAllowEntry } from '../hooks';
import { AddAllowEntryDialog } from './AddAllowEntryDialog';

/** The allow-list: the people and hosts this environment may still message. */
export function AllowListSection() {
  const entries = useOutboundAllowList();
  const removeEntry = useRemoveOutboundAllowEntry();
  const [isAdding, setIsAdding] = useState(false);
  const [removing, setRemoving] = useState<OutboundAllowEntry | null>(null);

  return (
    <PageSection
      title="Allowed recipients"
      description="Only these people and hosts receive email, texts, push, WhatsApp and webhooks from this environment. An empty list sends nothing."
      action={
        <Button size="sm" onClick={() => setIsAdding(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Allow recipient
        </Button>
      }
    >
      {entries.isLoading ? (
        <PageLoadingSkeleton variant="table" rows={3} />
      ) : entries.isError ? (
        <ListErrorState
          title="Couldn't load the allow-list."
          error={entries.error}
          onRetry={() => entries.refetch()}
          isRetrying={entries.isRefetching}
        />
      ) : (entries.data ?? []).length === 0 ? (
        <PageEmptyState
          icon={UserCheck}
          title="Nobody is on the list"
          description="Nothing is being sent to anyone. Add your team's addresses to test."
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipient</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden md:table-cell">Note</TableHead>
                <TableHead className="hidden md:table-cell">Added</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(entries.data ?? []).map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium text-foreground">{entry.value}</TableCell>
                  <TableCell className="text-muted-foreground">{ALLOW_KIND_LABEL[entry.kind]}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{entry.note ?? '—'}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    <RelativeTime iso={entry.createdAt} />
                    {entry.createdBy?.email ? ` by ${entry.createdBy.email}` : ''}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      menuLabel={`Actions for ${entry.value}`}
                      items={[
                        {
                          label: 'Remove',
                          ariaLabel: `Remove ${entry.value} from the allow-list`,
                          icon: Trash2,
                          destructive: true,
                          onSelect: () => setRemoving(entry),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AddAllowEntryDialog open={isAdding} onOpenChange={setIsAdding} />

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.value}?</AlertDialogTitle>
            <AlertDialogDescription>Messages to this recipient are held back from now on.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removing && removeEntry.mutate(removing.id, { onSettled: () => setRemoving(null) })}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageSection>
  );
}
