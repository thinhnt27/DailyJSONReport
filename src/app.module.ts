import { Module } from '@nestjs/common';
import { ConfigModule } from './infra/config/config.module';
import { DatabaseModule } from './infra/database.module';
import { EventDetectionsModule } from './modules/event-detections/event-detections.module';

@Module({
  imports: [ConfigModule, DatabaseModule, EventDetectionsModule],
})
export class AppModule {}
