'use client';

import { useState, useEffect } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@sally/ui/components/ui/sheet';
import { useChangePinMutation } from '../hooks/use-change-pin';

interface ChangePinSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePinSheet({ open, onOpenChange }: ChangePinSheetProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const mutation = useChangePinMutation();

  // Clear fields whenever the sheet closes (X button, Escape, or Cancel)
  useEffect(() => {
    if (!open) {
      setPin('');
      setConfirmPin('');
    }
  }, [open]);

  const isValid = pin.length === 4 && /^\d{4}$/.test(pin) && pin === confirmPin;

  const handleSubmit = () => {
    if (!isValid) return;
    mutation.mutate(pin, {
      onSuccess: () => {
        onOpenChange(false);
        setPin('');
        setConfirmPin('');
      },
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8">
        <div className="mx-auto w-10 h-1 bg-muted-foreground/30 rounded-full mb-6" />
        <SheetHeader className="text-left mb-6">
          <SheetTitle>Change PIN</SheetTitle>
          <SheetDescription>Enter a new 4-digit PIN.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>New PIN</Label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="• • • •"
              className="h-11 text-center text-xl tracking-[0.5em]"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm PIN</Label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="• • • •"
              className="h-11 text-center text-xl tracking-[0.5em]"
            />
          </div>
          {confirmPin.length === 4 && pin !== confirmPin && (
            <p className="text-xs text-critical">PINs don&apos;t match</p>
          )}
          <Button className="w-full h-11" disabled={!isValid} loading={mutation.isPending} onClick={handleSubmit}>
            Update PIN
          </Button>
          <Button
            variant="ghost"
            className="w-full h-11 text-muted-foreground"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
