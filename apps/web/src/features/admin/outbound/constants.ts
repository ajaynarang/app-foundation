import type { OutboundAllowKind, OutboundChannel } from '@app/shared-types';

/** What each kind of entry matches, in the add dialog's words. */
export const ALLOW_KIND_OPTIONS: ReadonlyArray<{
  kind: OutboundAllowKind;
  label: string;
  placeholder: string;
  hint: string;
}> = [
  { kind: 'EMAIL', label: 'Email address', placeholder: 'qa@example.com', hint: 'Exactly this address.' },
  {
    kind: 'EMAIL_DOMAIN',
    label: 'Email domain',
    placeholder: 'example.com',
    hint: 'Every address at this domain and its subdomains. Push reaches users whose email matches.',
  },
  {
    kind: 'PHONE',
    label: 'Phone number',
    placeholder: '+919812345678',
    hint: 'Texts, sign-in codes, WhatsApp and push for the user with this number. Include the country code.',
  },
  {
    kind: 'HOST',
    label: 'Web host',
    placeholder: 'hooks.example.com',
    hint: 'Customer webhooks sent to this host or its subdomains.',
  },
];

export const ALLOW_KIND_LABEL = Object.fromEntries(
  ALLOW_KIND_OPTIONS.map((option) => [option.kind, option.label]),
) as Record<OutboundAllowKind, string>;

export const CHANNEL_LABEL: Record<OutboundChannel, string> = {
  email: 'Email',
  sms: 'Text',
  push: 'Push',
  whatsapp: 'WhatsApp',
  webhook: 'Webhook',
};
