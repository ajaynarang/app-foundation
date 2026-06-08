'use client';

import { useState } from 'react';
import { Button } from '@app/ui/components/ui/button';
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';

export function LeadFormCard() {
  const [formData, setFormData] = useState({ name: '', email: '', fleetSize: '' });
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="rounded-lg border border-border bg-card p-3 text-center">
        <p className="text-sm font-medium text-foreground">Thanks, {formData.name}!</p>
        <p className="text-xs text-muted-foreground mt-1">We&apos;ll be in touch at {formData.email}.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <p className="text-sm font-medium text-foreground">Get in Touch</p>
      <div className="space-y-2">
        <div>
          <Label className="text-xs">Name</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
            placeholder="Your name"
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData((d) => ({ ...d, email: e.target.value }))}
            placeholder="you@company.com"
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">Fleet Size</Label>
          <Input
            value={formData.fleetSize}
            onChange={(e) => setFormData((d) => ({ ...d, fleetSize: e.target.value }))}
            placeholder="e.g., 50 trucks"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => setSubmitted(true)}
        disabled={!formData.name || !formData.email}
        className="w-full"
      >
        Send
      </Button>
    </div>
  );
}
