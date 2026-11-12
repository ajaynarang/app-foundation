import { ApiProperty } from '@nestjs/swagger';

/** `GET /push/vapid-key` — the Web Push application server key. */
export class PushVapidKey {
  @ApiProperty({ description: 'VAPID public key (base64url); empty string when push is not configured' })
  publicKey: string;
}
