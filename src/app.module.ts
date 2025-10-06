import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './infra/config/config.module';
import { DatabaseModule } from './infra/database.module';
import { EventDetectionsModule } from './modules/event-detections/event-detections.module';
import { LmStudioService } from './modules/lm-studio/application/lmstudio.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    DatabaseModule,
    EventDetectionsModule,
    HttpModule,
  ],
  providers: [LmStudioService],
})
export class AppModule {}
