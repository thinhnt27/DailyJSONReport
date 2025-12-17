// Scheduler for periodic suggestion analysis
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SuggestionService } from './suggestion.service';
import { PrismaService } from '@/infra/prisma/prisma.service';

@Injectable()
export class SuggestionScheduler {
  private readonly logger = new Logger(SuggestionScheduler.name);

  constructor(
    private readonly suggestionService: SuggestionService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Run fall risk analysis for all active users every 7 days
   * Cron: Every Sunday at 2:00 AM
   */
  @Cron('0 2 * * 0', {
    name: 'fall-risk-weekly-analysis',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async runWeeklyFallRiskAnalysis(): Promise<void> {
    this.logger.log('Starting weekly fall risk analysis for all users');

    try {
      // Get all active users
      const users = await this.prisma.client.users.findMany({
        select: {
          user_id: true,
        },
      });

      this.logger.log(`Found ${users.length} active users to analyze`);

      let successCount = 0;
      let failureCount = 0;

      // Process each user
      for (const user of users) {
        try {
          await this.suggestionService.analyzeFallRiskForUser(user.user_id);
          successCount++;
        } catch (error) {
          this.logger.error(
            `Failed to analyze user ${user.user_id}: ${error.message}`,
          );
          failureCount++;
        }
      }

      this.logger.log(
        `Weekly fall risk analysis completed: ${successCount} succeeded, ${failureCount} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to run weekly fall risk analysis: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Manual trigger for testing purposes
   * Can be called via an endpoint or admin panel
   */
  async manualTriggerForUser(userId: string): Promise<void> {
    this.logger.log(`Manual trigger: Analyzing fall risk for user ${userId}`);
    await this.suggestionService.analyzeFallRiskForUser(userId);
  }

  /**
   * Run device check analysis for all users with cameras daily
   * Cron: Every day at 9:00 AM
   */
  @Cron('0 9 * * *', {
    name: 'device-check-daily-analysis',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async runDailyDeviceCheckAnalysis(): Promise<void> {
    this.logger.log('Starting daily device check analysis');

    try {
      // Get distinct users who have cameras
      const usersWithCameras = await this.prisma.client.cameras.findMany({
        select: { user_id: true },
        distinct: ['user_id'],
      });

      this.logger.log(`Found ${usersWithCameras.length} users with cameras`);

      let successCount = 0;
      let failureCount = 0;

      for (const { user_id } of usersWithCameras) {
        try {
          await this.suggestionService.analyzeDeviceCheckForUser(user_id);
          successCount++;
        } catch (error) {
          this.logger.error(`Device check failed for ${user_id}: ${error.message}`);
          failureCount++;
        }
      }

      this.logger.log(
        `Daily device check completed: ${successCount} succeeded, ${failureCount} failed`,
      );
    } catch (error) {
      this.logger.error(`Device check scheduler failed: ${error.message}`, error.stack);
    }
  }
}
