import { IsNotEmpty, IsIn } from 'class-validator';

export class CreateConversationDto {
  @IsNotEmpty()
  @IsIn(['prospect', 'dispatcher', 'driver', 'owner', 'admin', 'super_admin', 'support'])
  userMode: string;
}
