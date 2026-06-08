import { PartialType } from '@nestjs/swagger';
import { CreateFactoringContactDto } from './create-factoring-contact.dto';

export class UpdateFactoringContactDto extends PartialType(CreateFactoringContactDto) {}
