import { Module } from '@nestjs/common';
import { EventDetectionsService } from './application/event-detections.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PrismaEventDetectionsRepo } from './infra/prisma/event-detections.repo';
import { EVENT_DETECTIONS_REPO } from './domain/repositories/event-detections.repo.interface';
import { EventDetectionsController } from './interface/event-detections.controller';

@Module({
  controllers: [EventDetectionsController],
  providers: [
    {
      provide: EVENT_DETECTIONS_REPO,
      useFactory: (prisma: PrismaService) =>
        new PrismaEventDetectionsRepo(prisma.client),
      inject: [PrismaService],
    },
    EventDetectionsService,
  ],
  exports: [EventDetectionsService, EVENT_DETECTIONS_REPO],
})
export class EventDetectionsModule {}
