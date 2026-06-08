import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';
import { CustomFieldValidatorService } from './custom-field-validator.service';

@Module({
  imports: [PrismaModule, CacheModule],
  controllers: [CustomFieldsController],
  providers: [CustomFieldsService, CustomFieldValidatorService],
  exports: [CustomFieldsService, CustomFieldValidatorService],
})
export class CustomFieldsModule {}
