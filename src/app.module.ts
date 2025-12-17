import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ConfigModule } from './infra/config/config.module';
import { DatabaseModule } from './infra/database.module';
import { EventDetectionsModule } from './modules/event-detections/event-detections.module';
import { LmStudioService } from './modules/lm-studio/application/lmstudio.service';
import { FileManageModule } from './modules/file-manage/file-manage.module';
import { AlarmNotifyConsumer } from './modules/file-manage/application/alarm-notify.consumer';
import { PgNotifyProvider } from './infra/pg-notify.provider';
import { PatientHabitsModule } from './modules/patient-habits/patient-habit.module';
import { PatientCameraModule } from './modules/patient-camera/patient-camera.module';
import { SuggestionsModule } from './modules/suggestions/suggestions.module';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    ConfigModule,
    DatabaseModule,
    EventDetectionsModule,
    FileManageModule,
    HttpModule,
    PatientHabitsModule,
    PatientCameraModule,
    SuggestionsModule,
  ],
  providers: [LmStudioService, PgNotifyProvider, AlarmNotifyConsumer],
})
export class AppModule {}
