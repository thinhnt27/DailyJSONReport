/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ConfigModule } from './infra/config/config.module';
import { DatabaseModule } from './infra/database.module';
import { EventDetectionsModule } from './modules/event-detections/event-detections.module';
import { HttpModule } from '@nestjs/axios';
import { LmStudioService } from './modules/event-detections/application/lmstudio.service';

@Module({
  imports: [ConfigModule, DatabaseModule, EventDetectionsModule, HttpModule],
  providers: [LmStudioService],
})
export class AppModule {}
