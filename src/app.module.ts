import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './infra/config/config.module';
import { DatabaseModule } from './infra/database.module';
import { EventDetectionsModule } from './modules/event-detections/event-detections.module';
import { LmStudioService } from './modules/lm-studio/application/lmstudio.service';
import { FileManageModule } from './modules/file-manage/file-manage.module';
import { AlarmNotifyConsumer } from './modules/file-manage/application/alarm-notify.consumer';
import { PgNotifyProvider } from './infra/pg-notify.provider';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    DatabaseModule,
    EventDetectionsModule,
    FileManageModule,
    HttpModule,
  ],
  providers: [LmStudioService, PgNotifyProvider, AlarmNotifyConsumer],
})
export class AppModule {}
