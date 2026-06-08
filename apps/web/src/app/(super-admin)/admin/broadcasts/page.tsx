'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { Megaphone, Plus, FileEdit, Send, Archive, FileText, Radio, ArchiveIcon } from 'lucide-react';

import {
  useBroadcasts,
  useCreateBroadcast,
  useUpdateBroadcast,
  usePublishBroadcast,
  useArchiveBroadcast,
  type Broadcast,
  type CreateBroadcastInput,
} from '@/features/platform/broadcasts';

// ---------- helpers ----------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'DRAFT':
      return <Badge variant="outline">Draft</Badge>;
    case 'PUBLISHED':
      return (
        <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/25">
          Published
        </Badge>
      );
    case 'ARCHIVED':
      return <Badge variant="muted">Archived</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case 'INFO':
      return <Badge variant="outline">Info</Badge>;
    case 'WARNING':
      return (
        <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/20 hover:bg-amber-500/25">Warning</Badge>
      );
    case 'CRITICAL':
      return <Badge variant="destructive">Critical</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
}

function getTargetLabel(targetType: string, targetIds: string[]) {
  switch (targetType) {
    case 'ALL':
      return 'All Tenants';
    case 'PLAN':
      return `By Plan (${targetIds.length})`;
    case 'TENANT':
      return `Specific (${targetIds.length})`;
    default:
      return targetType;
  }
}

// ---------- skeleton ----------

function BroadcastsPageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6 text-center">
              <Skeleton className="h-9 w-12 mx-auto" />
              <Skeleton className="h-4 w-20 mx-auto mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table skeleton */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- create/edit sheet ----------

interface BroadcastSheetProps {
  broadcast: Broadcast | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function BroadcastSheet({ broadcast, open, onOpenChange }: BroadcastSheetProps) {
  const isEditing = !!broadcast;

  const [title, setTitle] = useState(() => broadcast?.title ?? '');
  const [body, setBody] = useState(() => broadcast?.body ?? '');
  const [targetType, setTargetType] = useState<string>(() => broadcast?.targetType ?? 'ALL');
  const [targetIdsRaw, setTargetIdsRaw] = useState(() => broadcast?.targetIds.join(', ') ?? '');
  const [priority, setPriority] = useState<string>(() => broadcast?.priority ?? 'INFO');
  const [expiresAt, setExpiresAt] = useState(() =>
    broadcast?.expiresAt ? new Date(broadcast.expiresAt).toISOString().slice(0, 16) : '',
  );

  const createMutation = useCreateBroadcast();
  const updateMutation = useUpdateBroadcast();
  const publishMutation = usePublishBroadcast();

  const buildInput = (): CreateBroadcastInput => {
    const targetIds =
      targetType !== 'ALL'
        ? targetIdsRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    return {
      title,
      body,
      targetType,
      targetIds,
      priority,
      ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
    };
  };

  const handleSave = () => {
    const input = buildInput();
    if (isEditing) {
      updateMutation.mutate({ id: broadcast.id, input }, { onSuccess: () => onOpenChange(false) });
    } else {
      createMutation.mutate(input, {
        onSuccess: () => onOpenChange(false),
      });
    }
  };

  const handlePublish = () => {
    if (!broadcast) return;
    // Save first, then publish
    const input = buildInput();
    updateMutation.mutate(
      { id: broadcast.id, input },
      {
        onSuccess: () => {
          publishMutation.mutate(broadcast.id, {
            onSuccess: () => onOpenChange(false),
          });
        },
      },
    );
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isPublishing = publishMutation.isPending;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto"
        pinnable
        resizable
        defaultPinned
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-muted-foreground" />
            {isEditing ? 'Edit Broadcast' : 'Create Broadcast'}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5" onKeyDown={handleKeyDown}>
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="broadcast-title">Title</Label>
            <Input
              id="broadcast-title"
              placeholder="e.g. Scheduled Maintenance — March 25"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="broadcast-body">Body</Label>
            <Textarea
              id="broadcast-body"
              placeholder="Describe the announcement..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
            />
          </div>

          {/* Target Type */}
          <div className="space-y-2">
            <Label>Target</Label>
            <Select value={targetType} onValueChange={setTargetType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Tenants</SelectItem>
                <SelectItem value="PLAN">By Plan</SelectItem>
                <SelectItem value="TENANT">Specific Tenants</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Target IDs (visible for PLAN or TENANT) */}
          {targetType !== 'ALL' && (
            <div className="space-y-2">
              <Label htmlFor="broadcast-target-ids">
                {targetType === 'PLAN' ? 'Plan Slugs' : 'Tenant IDs'}{' '}
                <span className="text-muted-foreground">(comma-separated)</span>
              </Label>
              <Input
                id="broadcast-target-ids"
                placeholder={targetType === 'PLAN' ? 'e.g. starter, professional' : 'e.g. tenant_abc, tenant_xyz'}
                value={targetIdsRaw}
                onChange={(e) => setTargetIdsRaw(e.target.value)}
              />
            </div>
          )}

          {/* Priority */}
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INFO">Info</SelectItem>
                <SelectItem value="WARNING">Warning</SelectItem>
                <SelectItem value="CRITICAL">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Expires At */}
          <div className="space-y-2">
            <Label htmlFor="broadcast-expires">
              Expires At <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="broadcast-expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-border sticky bottom-0 bg-background pb-2">
            <Button
              onClick={handleSave}
              loading={isSaving}
              disabled={!title.trim() || !body.trim() || isSaving || isPublishing}
            >
              {isEditing ? 'Save Changes' : 'Save as Draft'}
            </Button>
            {isEditing && broadcast.status === 'DRAFT' && (
              <Button
                variant="outline"
                onClick={handlePublish}
                loading={isPublishing}
                disabled={!title.trim() || !body.trim() || isSaving || isPublishing}
              >
                <Send className="h-4 w-4 mr-1.5" />
                Publish
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving || isPublishing}>
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------- main page ----------

export default function BroadcastsPage() {
  const { data: broadcasts = [], isLoading } = useBroadcasts();
  const publishMutation = usePublishBroadcast();
  const archiveMutation = useArchiveBroadcast();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingBroadcast, setEditingBroadcast] = useState<Broadcast | null>(null);

  // Compute stats
  const stats = useMemo(() => {
    const draft = broadcasts.filter((b) => b.status === 'DRAFT').length;
    const published = broadcasts.filter((b) => b.status === 'PUBLISHED').length;
    const archived = broadcasts.filter((b) => b.status === 'ARCHIVED').length;
    return { draft, published, archived };
  }, [broadcasts]);

  const handleCreate = () => {
    setEditingBroadcast(null);
    setSheetOpen(true);
  };

  const handleEdit = (broadcast: Broadcast) => {
    setEditingBroadcast(broadcast);
    setSheetOpen(true);
  };

  const handlePublish = (id: number) => {
    publishMutation.mutate(id);
  };

  const handleArchive = (id: number) => {
    archiveMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <BroadcastsPageSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Broadcasts</h1>
            <p className="text-sm text-muted-foreground">
              Communicate maintenance, updates, and critical notices to your tenants
            </p>
          </div>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          Create Broadcast
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.draft}</p>
              <p className="text-sm text-muted-foreground">Drafts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <Radio className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.published}</p>
              <p className="text-sm text-muted-foreground">Published</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <ArchiveIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.archived}</p>
              <p className="text-sm text-muted-foreground">Archived</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {broadcasts.length === 0 ? (
            <div className="text-center py-12">
              <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium text-foreground">No broadcasts yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create one to communicate with your tenants.</p>
              <Button className="mt-4" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create Broadcast
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {broadcasts.map((broadcast) => (
                  <TableRow key={broadcast.id}>
                    <TableCell className="font-medium max-w-[250px] truncate">{broadcast.title}</TableCell>
                    <TableCell>{getStatusBadge(broadcast.status)}</TableCell>
                    <TableCell>{getPriorityBadge(broadcast.priority)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {getTargetLabel(broadcast.targetType, broadcast.targetIds)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(broadcast.publishedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {broadcast.status === 'DRAFT' && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(broadcast)}>
                              <FileEdit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePublish(broadcast.id)}
                              loading={publishMutation.isPending && publishMutation.variables === broadcast.id}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {broadcast.status === 'PUBLISHED' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleArchive(broadcast.id)}
                            loading={archiveMutation.isPending && archiveMutation.variables === broadcast.id}
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Sheet */}
      <BroadcastSheet
        key={editingBroadcast?.id ?? 'new'}
        broadcast={editingBroadcast}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
