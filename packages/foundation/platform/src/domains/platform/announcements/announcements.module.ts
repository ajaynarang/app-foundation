import { Module } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller';
import { BroadcastsPublicController } from './broadcasts-public.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [],
  controllers: [AnnouncementsController, BroadcastsPublicController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
