import { Inject, Injectable, Optional } from '@nestjs/common';
import type { NotificationType } from '@appshore/db';

export interface WhatsAppTemplateContext {
  title: string;
  message: string;
  metadata?: Record<string, any>;
  clubName: string;
}

export type WhatsAppConsentKind = 'utility' | 'marketing';

export interface WhatsAppTemplateSendSpec {
  templateName: string;
  languageCode: string;
  bodyValues: string[];
}

export interface WhatsAppTemplate {
  name: string;
  languageCode: 'en';
  /** Meta prices and caps MARKETING separately; the consent it needs is separate too. */
  category: 'UTILITY' | 'MARKETING';
  /** The exact text submitted to Meta. The registry is the source of truth; Meta holds a copy. */
  body: string;
  /** null = the context cannot fill this template; the delivery is SKIPPED/NO_TEMPLATE. */
  bodyValues: (ctx: WhatsAppTemplateContext) => string[] | null;
}

export type WhatsAppTemplateMap = Partial<Record<NotificationType, WhatsAppTemplate>>;

/** DI token an app binds its approved templates to. Unbound = no type has a template. */
export const WHATSAPP_TEMPLATES = 'APPSHORE_WHATSAPP_TEMPLATES';

/** Meta rejects newlines, tabs and 4+ spaces inside a parameter, and long ones. */
export const templateParam = (value: unknown): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

/** A parameter that must carry text; empty means the template cannot be filled. */
export const requiredParam = (value: unknown): string | null => {
  const cleaned = templateParam(value);
  return cleaned.length > 0 ? cleaned : null;
};

/** Every value present, or nothing — a template with a missing parameter is a Meta rejection. */
export const allParams = (...values: (string | null)[]): string[] | null =>
  values.every((v): v is string => v !== null) ? values : null;

@Injectable()
export class WhatsAppTemplateRegistry {
  constructor(@Optional() @Inject(WHATSAPP_TEMPLATES) private readonly templates: WhatsAppTemplateMap = {}) {}

  has(type: NotificationType): boolean {
    return Boolean(this.templates[type]);
  }

  resolve(type: NotificationType, ctx: WhatsAppTemplateContext): WhatsAppTemplateSendSpec | null {
    const template = this.templates[type];
    if (!template) return null;
    const bodyValues = template.bodyValues(ctx);
    if (!bodyValues) return null;
    return { templateName: template.name, languageCode: template.languageCode, bodyValues };
  }

  /** Which yes a type needs. Unknown types are utility: they never send anyway (NO_TEMPLATE). */
  consentKind(type: NotificationType): WhatsAppConsentKind {
    return this.templates[type]?.category === 'MARKETING' ? 'marketing' : 'utility';
  }
}
