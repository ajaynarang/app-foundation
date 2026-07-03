import { ApprovalDecision } from '@appshore/db';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

/**
 * POST /desk/approvals/:id/decide body.
 *
 * Four UI button flows map to this single endpoint:
 *   • Approve         → { decision: APPROVED }
 *   • Edit & Approve  → { decision: EDITED, editedAction }
 *   • Reject          → { decision: REJECTED, rejectionReason }  (workflow re-drafts)
 *   • Reject & close  → { decision: REJECTED, rejectionReason, terminate: true }
 */
export class DecideApprovalDto {
  @ApiProperty({ enum: ApprovalDecision })
  @IsEnum(ApprovalDecision)
  decision!: ApprovalDecision;

  @ApiProperty({
    required: false,
    description: 'Required when decision=EDITED. Replaces the proposed action.',
  })
  @ValidateIf((o) => o.decision === 'EDITED')
  @IsObject()
  editedAction?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: 'Required when decision=REJECTED. Passed to the workflow re-draft (unless terminate=true).',
  })
  @ValidateIf((o) => o.decision === 'REJECTED')
  @IsString()
  @MaxLength(2000)
  rejectionReason?: string;

  @ApiProperty({
    required: false,
    default: false,
    description: 'Reject & close — terminate the episode immediately instead of letting the workflow retry.',
  })
  @IsOptional()
  @IsBoolean()
  terminate?: boolean;
}
