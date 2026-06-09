'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@app/ui/components/ui/sheet';
import { Button } from '@app/ui/components/ui/button';
import { Label } from '@app/ui/components/ui/label';
import { Slider } from '@app/ui/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { Settings, Check, Mic } from 'lucide-react';
import { getUserPreferences, updateUserPreferences } from '../../settings/api';
import { getVoiceStatus } from '../api';
import { showSuccess, showError } from '@/shared/lib/toast';
import { useAssistantStore } from '../store';
import { type VoicePreferences } from '../voice/types';

/** All voices are Assistant — different tones. */
const VOICE_TONES = [
  { key: 'warm', label: 'Warm', desc: 'Friendly & professional' },
  { key: 'confident', label: 'Confident', desc: 'Energetic & clear' },
  { key: 'calm', label: 'Calm', desc: 'Soothing & steady' },
] as const;

const SPEED_LABELS = ['Slowest', 'Slow', 'Normal', 'Fast', 'Fastest'] as const;
const SPEED_VALUES = ['slowest', 'slow', 'normal', 'fast', 'fastest'] as const;

export function AssistantVoiceSettings() {
  const [open, setOpen] = useState(false);
  const [isVoiceAvailable, setIsVoiceAvailable] = useState(false);
  const voicePrefs = useAssistantStore((s) => s.voicePrefs);
  const setVoicePrefs = useAssistantStore((s) => s.setVoicePrefs);

  // Check voice availability on mount
  useEffect(() => {
    getVoiceStatus()
      .then((status) => setIsVoiceAvailable(status.available))
      .catch(() => setIsVoiceAvailable(false));
  }, []);

  // Fetch preferences when sheet opens
  useEffect(() => {
    if (!open) return;
    getUserPreferences()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((prefs: any) => {
        if (prefs) {
          setVoicePrefs({
            voiceMode: prefs.voiceMode || 'manual',
            voiceId: prefs.voiceId || 'warm',
            voiceSpeed: prefs.voiceSpeed || 'normal',
          });
        }
      })
      .catch(() => {
        /* use defaults */
      });
  }, [open, setVoicePrefs]);

  // Don't render if voice is not available
  if (!isVoiceAvailable) return null;

  const speedIndex = SPEED_VALUES.indexOf(voicePrefs.voiceSpeed);

  const handleUpdate = async (updates: Partial<VoicePreferences>) => {
    const newPrefs = { ...voicePrefs, ...updates };
    setVoicePrefs(newPrefs);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateUserPreferences(updates as any);
      showSuccess('Voice settings saved');
    } catch {
      showError('Failed to save voice settings');
    }
  };

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} className="h-8 w-8" aria-label="Voice settings">
        <Settings className="h-4 w-4" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" pinnable resizable className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Voice Settings</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-8">
            {/* Voice Mode */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Voice Mode</Label>
              <RadioGroup
                value={voicePrefs.voiceMode}
                onValueChange={(val) => handleUpdate({ voiceMode: val as VoicePreferences['voiceMode'] })}
                className="space-y-2"
              >
                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    voicePrefs.voiceMode === 'manual'
                      ? 'border-foreground/30 bg-muted/50'
                      : 'border-border hover:border-foreground/20'
                  }`}
                >
                  <RadioGroupItem value="manual" className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Manual</p>
                    <p className="text-xs text-muted-foreground">Review transcript before sending</p>
                  </div>
                </label>
                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    voicePrefs.voiceMode === 'auto'
                      ? 'border-foreground/30 bg-muted/50'
                      : 'border-border hover:border-foreground/20'
                  }`}
                >
                  <RadioGroupItem value="auto" className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Auto</p>
                    <p className="text-xs text-muted-foreground">Assistant responds as soon as you finish speaking</p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {/* Voice Tone */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Assistant&apos;s Tone</Label>
              <div className="grid grid-cols-3 gap-2">
                {VOICE_TONES.map((tone) => (
                  <Button
                    key={tone.key}
                    variant="outline"
                    onClick={() => handleUpdate({ voiceId: tone.key as VoicePreferences['voiceId'] })}
                    className={`relative flex flex-col items-center gap-1 h-auto py-3 ${
                      voicePrefs.voiceId === tone.key ? 'border-foreground/40 bg-muted/50' : ''
                    }`}
                  >
                    {voicePrefs.voiceId === tone.key && (
                      <Check className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-foreground" />
                    )}
                    <Mic className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">{tone.label}</span>
                    <span className="text-2xs text-muted-foreground">{tone.desc}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Speech Speed */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Speech Speed</Label>
              <div className="px-1">
                <Slider
                  value={[speedIndex >= 0 ? speedIndex : 2]}
                  min={0}
                  max={4}
                  step={1}
                  onValueChange={([val]) => {
                    handleUpdate({ voiceSpeed: SPEED_VALUES[val] });
                  }}
                />
                <div className="flex justify-between mt-1.5">
                  {SPEED_LABELS.map((label) => (
                    <span key={label} className="text-2xs text-muted-foreground">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Changes apply to your next voice session.</p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
