// Module configuration for Suggestions
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SuggestionController } from './interface/suggestion.controller';
import { SuggestionService } from './application/suggestion.service';
import { SuggestionAnalyzerService } from './application/suggestion-analyzer.service';
import { DeviceCheckAnalyzerService } from './application/device-check-analyzer.service';
import { SleepAnalyzerService } from './application/sleep-analyzer.service';
import { SuggestionScheduler } from './application/suggestion.scheduler';
import { PrismaSuggestionRepo } from './infra/prisma/suggestion.repo';
import { SUGGESTION_REPO } from './domain/repositories/suggestion.repo.interface';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EventDetectionsModule } from '../event-detections/event-detections.module';
import { PatientCameraModule } from '../patient-camera/patient-camera.module';

@Module({
  imports: [
    ScheduleModule.forRoot(), // Enable scheduled tasks
    EventDetectionsModule, // Import to access EventDetectionsRepo
    PatientCameraModule, // Import for camera analysis
  ],
  controllers: [SuggestionController],
  providers: [
    // Services
    SuggestionService,
    SuggestionAnalyzerService,
    DeviceCheckAnalyzerService,
    SleepAnalyzerService,
    SuggestionScheduler,

    // Repository
    {
      provide: SUGGESTION_REPO,
      useFactory: (prisma: PrismaService) => new PrismaSuggestionRepo(prisma.client),
      inject: [PrismaService],
    },

    // Prisma
    PrismaService,
  ],
  exports: [SuggestionService], // Export for use in other modules
})
export class SuggestionsModule {}
