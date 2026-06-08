import { IsString, IsOptional, IsBoolean, IsIn, MinLength, MaxLength } from 'class-validator';

export class CreateShiftNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['urgent', 'action_required', 'info'])
  priority?: string;
}
