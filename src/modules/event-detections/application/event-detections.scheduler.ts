import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventDetectionsService } from './event-detections.service';

/**
 * EventDetectionsScheduler
 *
 * Runs periodically to fetch events and run AI analysis. Schedule uses
 * CronExpression.EVERY_DAY_AT_1AM by default. This can be changed later
 * to read from configuration or environment variables.
 */
@Injectable()
export class EventDetectionsScheduler {
  private readonly logger = new Logger(EventDetectionsScheduler.name);

  constructor(private readonly svc: EventDetectionsService) {}

  // Runs daily at 01:00 server time. Update to use a config value if needed.
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleDailyAnalysis() {
    this.logger.log('Starting daily event detection job');
    try {
      const analyzed = await this.svc.fetchEventsAndAnalyze();
      this.logger.log(
        `Daily event detection completed; analyzed ${analyzed?.length ?? 0} items`,
      );
    } catch (err) {
      this.logger.error('Daily event detection failed', err as Error | string);
    }
  }

  // Expose a manual trigger that can be used from other services or tests
  async triggerNow() {
    this.logger.log('Manual trigger invoked for event detection');
    return this.handleDailyAnalysis();
  }
}
