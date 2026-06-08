import { IsInt, IsOptional, IsString, IsIn } from 'class-validator';
import type { CreateNoaRecordInput, UpdateNoaStatusInput } from '@sally/shared-types';

export class CreateNoaRecordDto implements CreateNoaRecordInput {
  @IsInt()
  customerId: number;

  @IsInt()
  factoringCompanyId: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateNoaStatusDto implements UpdateNoaStatusInput {
  @IsString()
  @IsIn(['NOT_SENT', 'SENT', 'ACKNOWLEDGED', 'REJECTED'])
  status: 'NOT_SENT' | 'SENT' | 'ACKNOWLEDGED' | 'REJECTED';

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
