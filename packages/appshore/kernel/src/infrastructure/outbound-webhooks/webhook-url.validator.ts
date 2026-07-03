import { BadRequestException } from '@nestjs/common';

const BLOCKED_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/0\.0\.0\.0/,
  /^https?:\/\/\[::1\]/,
  /^https?:\/\/10\.\d+\.\d+\.\d+/,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/,
  /^https?:\/\/192\.168\.\d+\.\d+/,
  /^https?:\/\/169\.254\.\d+\.\d+/, // link-local / AWS IMDS
  /^https?:\/\/100\.64\.\d+\.\d+/, // CGNAT
  /^https?:\/\/\[fc[0-9a-f]{2}:/i, // IPv6 ULA
  /^https?:\/\/\[fe[89ab][0-9a-f]:/i, // IPv6 link-local
];

export function assertSafeWebhookUrl(url: string): void {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(url)) {
      throw new BadRequestException('Webhook URL must not target private, loopback, or link-local addresses');
    }
  }
}
