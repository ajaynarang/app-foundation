'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { AlertTriangle, Camera, MapPin } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { Button } from '@sally/ui/components/ui/button';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Label } from '@sally/ui/components/ui/label';
import { useCreateDriverAction } from '@/features/fleet/loads/hooks/use-driver-actions';

interface IssueReportFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
}

export function IssueReportForm({ open, onOpenChange, loadId }: IssueReportFormProps) {
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lon: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createAction = useCreateDriverAction();

  // Auto-capture GPS on open
  useEffect(() => {
    if (open && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGps({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => {}, // Silently fail — GPS is optional
        { enableHighAccuracy: false, timeout: 5000 },
      );
    }
  }, [open]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!description.trim()) return;
    createAction.mutate(
      {
        loadId,
        actionType: 'issue_report',
        note: description,
        metadata: { gps, hasPhoto: !!photo },
      },
      {
        onSuccess: () => {
          setDescription('');
          setPhoto(null);
          setGps(null);
          onOpenChange(false);
        },
      },
    );
  }, [description, gps, photo, loadId, createAction, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8" onInteractOutside={(e) => e.preventDefault()}>
        <SheetHeader className="pb-4">
          <SheetTitle className="text-left flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-400/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-red-400" />
            </div>
            Report Issue
          </SheetTitle>
          <p className="text-sm text-muted-foreground text-left">Dispatch will be notified immediately</p>
        </SheetHeader>

        <div className="space-y-4">
          {/* Description */}
          <div>
            <Label htmlFor="issue-description" className="text-xs text-muted-foreground">
              What happened?
            </Label>
            <Textarea
              id="issue-description"
              placeholder="Describe the issue — breakdown, accident, cargo damage, etc."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 resize-none"
              rows={4}
              autoFocus
            />
          </div>

          {/* Photo */}
          {photo ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo}
                alt="Issue photo"
                className="w-full max-h-40 object-contain rounded-xl border border-border"
              />
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 h-7 text-xs"
                onClick={() => setPhoto(null)}
              >
                Remove
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
              <Camera className="h-4 w-4 mr-2" />
              Add Photo (optional)
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* GPS indicator */}
          {gps && (
            <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              Location captured ({gps.lat.toFixed(4)}, {gps.lon.toFixed(4)})
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={!description.trim()}
              loading={createAction.isPending}
              onClick={handleSubmit}
            >
              Report Issue
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
