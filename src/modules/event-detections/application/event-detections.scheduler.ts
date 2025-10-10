// import { Injectable, Logger } from '@nestjs/common';
// import { Cron, CronExpression } from '@nestjs/schedule';
// import { EventDetectionsService } from './event-detections.service';

// /**
//  * EventDetectionsScheduler
//  *
//  * Runs periodically to fetch events and run AI analysis. Schedule uses
//  * CronExpression.EVERY_DAY_AT_1AM by default. This can be changed later
//  * to read from configuration or environment variables.
//  */
// @Injectable()
// export class EventDetectionsScheduler {
//   private readonly logger = new Logger(EventDetectionsScheduler.name);

//   constructor(private readonly svc: EventDetectionsService) {}

//   // Runs daily at 01:00 server time. Update to use a config value if needed.
//   @Cron(CronExpression.EVERY_DAY_AT_1AM)
//   async handleDailyAnalysis() {
//     this.logger.log('Starting daily event detection job');
//     try {
//       const users = await this.svc.fetchEventsAndAnalyze();
//       // Count total events across all users
//       const count = Array.isArray(users)
//         ? users.reduce((acc, u: Record<string, unknown>) => {
//             const ev = u['event-detections'];
//             if (Array.isArray(ev)) return acc + ev.length;
//             return acc;
//           }, 0)
//         : 0;
//       this.logger.log(
//         `Daily event detection completed; processed ${count} events`,
//       );
//     } catch (err) {
//       this.logger.error('Daily event detection failed', err as Error | string);
//     }
//   }

//   // Expose a manual trigger that can be used from other services or tests
//   async triggerNow() {
//     this.logger.log('Manual trigger invoked for event detection');
//     return this.handleDailyAnalysis();
//   }
// }
