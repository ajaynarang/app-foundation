import { IsString, IsOptional, IsIn } from 'class-validator';
import type { CreateLoadNoteInput } from '@sally/shared-types';

const VALID_NOTE_TYPES = ['note', 'dispatch_update', 'driver_update', 'customer_update', 'system'];

export class CreateLoadNoteDto implements CreateLoadNoteInput {
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  @IsIn(VALID_NOTE_TYPES)
  noteType?: string;
}
