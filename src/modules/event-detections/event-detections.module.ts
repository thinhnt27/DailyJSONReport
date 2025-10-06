import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EventDetectionsScheduler } from './application/event-detections.scheduler';
import { EventDetectionsService } from './application/event-detections.service';
import { LmStudioService } from '@modules/lm-studio/application/lmstudio.service';
import { EVENT_DETECTIONS_REPO } from './domain/repositories/event-detections.repo.interface';
import { PrismaEventDetectionsRepo } from './infra/prisma/event-detections.repo';
import { EventDetectionsController } from './interface/event-detections.controller';

@Module({
  imports: [
    HttpModule, // <- BẮT BUỘC vì LmStudioService inject HttpService
  ],
  controllers: [EventDetectionsController],
  providers: [
    {
      provide: EVENT_DETECTIONS_REPO,
      useFactory: (prisma: PrismaService) =>
        new PrismaEventDetectionsRepo(prisma.client),
      inject: [PrismaService],
    },
    EventDetectionsService,
    EventDetectionsScheduler,
    LmStudioService,
  ],
  exports: [EventDetectionsService, EVENT_DETECTIONS_REPO, LmStudioService],
})
export class EventDetectionsModule {}
