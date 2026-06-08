'use client';

import { useState } from 'react';
import { ListChecks, Plus, Trash2 } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Switch } from '@sally/ui/components/ui/switch';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Separator } from '@sally/ui/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@sally/ui/components/ui/sheet';
import { showSuccess, showError } from '@sally/ui';
import {
  useShieldCustomRules,
  useCreateCustomRule,
  useUpdateCustomRule,
  useDeleteCustomRule,
} from '../hooks/use-shield';

interface CustomRulesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Plain-English custom compliance rules, checked by AI during audits. Opened from the Shield ⋯ More menu. */
export function CustomRulesSheet({ open, onOpenChange }: CustomRulesSheetProps) {
  const { data: rules, isLoading } = useShieldCustomRules();
  const createRule = useCreateCustomRule();
  const updateRule = useUpdateCustomRule();
  const deleteRule = useDeleteCustomRule();
  const [newRule, setNewRule] = useState('');

  const handleCreate = () => {
    if (newRule.trim().length < 10) return;
    createRule.mutate(newRule.trim(), {
      onSuccess: () => {
        setNewRule('');
        showSuccess('Custom rule created');
      },
      onError: () => {
        showError('Failed to create rule');
      },
    });
  };

  const activeCount = rules?.filter((r) => r.isActive).length ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-6 overflow-y-auto" pinnable resizable>
        <SheetHeader>
          <SheetTitle>Custom Rules</SheetTitle>
          <SheetDescription>
            Plain-English compliance rules checked by AI during audits. Rules must be at least 10 characters.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="flex gap-2">
            <Input
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              placeholder="e.g. All drivers must have a valid medical card on file"
              className="text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
            <Button
              onClick={handleCreate}
              loading={createRule.isPending}
              disabled={newRule.trim().length < 10}
              size="sm"
              className="shrink-0"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add
            </Button>
          </div>

          <Separator />

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : !rules || rules.length === 0 ? (
            <div className="text-center py-8">
              <ListChecks className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No custom rules yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add your first rule above to start checking custom compliance criteria.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground mb-2">
                {activeCount} of {rules.length} rule{rules.length !== 1 ? 's' : ''} active
              </p>
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-start gap-3 py-2.5 px-3 rounded-md border border-border group hover:bg-accent/50"
                >
                  <Switch
                    checked={rule.isActive}
                    onCheckedChange={(checked) => updateRule.mutate({ ruleId: rule.id, data: { isActive: checked } })}
                    className="mt-0.5 shrink-0"
                  />
                  <span
                    className={`flex-1 text-sm leading-snug ${
                      rule.isActive ? 'text-foreground' : 'text-muted-foreground line-through'
                    }`}
                  >
                    {rule.rule}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-critical"
                    onClick={() =>
                      deleteRule.mutate(rule.id, {
                        onSuccess: () => showSuccess('Rule deleted'),
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
