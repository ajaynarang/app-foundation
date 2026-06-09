import { IsNotEmpty, IsIn } from 'class-validator';
import type { UserMode } from '../../agents/agent.types';

export class CreateConversationDto {
  @IsNotEmpty()
  @IsIn(['owner', 'admin', 'member', 'super_admin'])
  userMode: UserMode;
}
