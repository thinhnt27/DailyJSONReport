// Service for Suggestion business logic
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ISuggestionRepo, SUGGESTION_REPO } from '../domain/repositories/suggestion.repo.interface';
import {
  IEventDetectionsRepo,
  EVENT_DETECTIONS_REPO,
} from '@/modules/event-detections/domain/repositories/event-detections.repo.interface';
import {
  SuggestionAnalyzerService,
  FallRiskAnalysisInput,
} from './suggestion-analyzer.service';
import { DeviceCheckAnalyzerService } from './device-check-analyzer.service';
import { SleepAnalyzerService } from './sleep-analyzer.service';
import { SuggestionCategory } from '../domain/suggestion.entity';
import type { suggestions } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';

@Injectable()
export class SuggestionService {
  private readonly logger = new Logger(SuggestionService.name);

  constructor(
    @Inject(SUGGESTION_REPO)
    private readonly suggestionRepo: ISuggestionRepo,
    @Inject(EVENT_DETECTIONS_REPO)
    private readonly eventRepo: IEventDetectionsRepo,
    private readonly analyzer: SuggestionAnalyzerService,
    private readonly deviceCheckAnalyzer: DeviceCheckAnalyzerService,
    private readonly sleepAnalyzer: SleepAnalyzerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Analyze fall risk for a user and create/update suggestions
   * Runs on a schedule (every 7 days)
   */
  async analyzeFallRiskForUser(userId: string, days: number = 7): Promise<void> {
    this.logger.log(`Starting fall risk analysis for user: ${userId} (last ${days} days)`);

    try {
      // Fetch fall events grouped by camera from last N days
      const groupedEvents =
        await this.eventRepo.findFallEventsByUserGroupedByCamera(userId, days);

      this.logger.log(
        `Found ${groupedEvents.length} cameras with fall events for user ${userId}`,
      );

      // If no events, skip creating suggestions
      if (groupedEvents.length === 0) {
        this.logger.log(
          `No fall events in last ${days} days for user ${userId}, skipping suggestion creation`,
        );
        return;
      }

      // Process each camera location with >= 2 events
      for (const group of groupedEvents) {
        if (group.event_count < 2) {
          this.logger.debug(
            `Skipping ${group.camera_name}: only ${group.event_count} events (threshold: 2)`,
          );
          continue;
        }

        // Prepare input for analyzer
        const analysisInput: FallRiskAnalysisInput = {
          cameraName: group.camera_name,
          locationInRoom: group.location_in_room,
          eventCount: group.event_count,
          events: group.events.map((e) => ({
            event_id: e.event_id,
            status: e.status,
            detected_at: e.detected_at,
            event_description: e.event_description,
          })),
        };

        // Generate bullets using AI (with fallback)
        const analysisResult =
          await this.analyzer.analyzeFallRisk(analysisInput);

        this.logger.log(
          `Generated bullets for ${group.camera_name} (AI: ${analysisResult.generatedByAI})`,
        );

        // Prepare suggestion data
        const title = `Kiểm tra lại ${group.camera_name}`;
        const message = `Đã ghi nhận ${group.event_count} sự kiện ngã đổ trong ${days} ngày qua`;
        const meta = {
          bullets: analysisResult.bullets,
          generatedByAI: analysisResult.generatedByAI,
          camera_id: group.camera_id,
          location: group.location_in_room,
          event_count: group.event_count,
          analysis_date: new Date().toISOString(),
        };

        // Upsert suggestion (create if not exists, update if exists)
        await this.suggestionRepo.upsertSuggestion({
          user_id: userId,
          type: SuggestionCategory.FALL_RISK,
          title,
          message,
          meta,
        });

        this.logger.log(
          `Upserted suggestion for ${group.camera_name} (${group.event_count} events)`,
        );
      }

      this.logger.log(`Completed fall risk analysis for user: ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to analyze fall risk for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get active suggestions for a user
   */
  async getSuggestionsForUser(
    userId: string,
    category?: SuggestionCategory,
  ): Promise<suggestions[]> {
    return this.suggestionRepo.findByUserId(userId, category);
  }

  /**
   * Toggle skip status for a suggestion
   */
  async toggleSkipSuggestion(
    suggestionId: string,
    skip: boolean,
  ): Promise<suggestions> {
    if (skip) {
      return this.suggestionRepo.skip(suggestionId);
    } else {
      return this.suggestionRepo.unskip(suggestionId);
    }
  }

  /**
   * Resolve (dismiss) a suggestion
   */
  async resolveSuggestion(suggestionId: string): Promise<suggestions> {
    return this.suggestionRepo.resolve(suggestionId);
  }

  /**
   * Analyze device/camera quality for a user and create device check suggestions
   */
  async analyzeDeviceCheckForUser(userId: string, debug = false): Promise<any> {
    this.logger.log(`Starting device check analysis for user: ${userId}`);
    const debugInfo: any = { userId, cameras: [], results: [] };

    try {
      // Get all cameras for this user
      const cameras = await this.prisma.client.cameras.findMany({
        where: { user_id: userId },
        select: {
          camera_id: true,
          camera_name: true,
          rtsp_url: true,
          location_in_room: true,
        },
      });

      this.logger.log(`Query returned: ${JSON.stringify(cameras)}`);
      if (debug) debugInfo.cameras = cameras;

      if (cameras.length === 0) {
        this.logger.log(`No cameras found for user ${userId}`);
        return debug ? { ...debugInfo, message: 'No cameras found' } : undefined;
      }

      this.logger.log(`Found ${cameras.length} cameras for user ${userId}`);

      // Analyze each camera
      for (const camera of cameras) {
        if (!camera.rtsp_url) {
          this.logger.debug(`Skipping ${camera.camera_name}: no RTSP URL`);
          if (debug) debugInfo.results.push({ camera: camera.camera_name, skipped: true, reason: 'no RTSP URL' });
          continue;
        }

        const result = await this.deviceCheckAnalyzer.analyzeDeviceCheck({
          userId,
          cameraId: camera.camera_id,
          cameraName: camera.camera_name,
          rtspUrl: camera.rtsp_url,
          locationInRoom: camera.location_in_room,
        });

        if (debug) {
          debugInfo.results.push({
            camera: camera.camera_name,
            brightness: result.brightness,
            quality: result.qualityLevel,
            bullets: result.bullets,
          });
        }

        // Only create suggestion if quality is not excellent
        if (result.qualityLevel !== 'excellent') {
          this.logger.log(
            `Creating device check suggestion for ${camera.camera_name} (${result.qualityLevel}, ${result.brightness}%)`,
          );

          const title = `Cải thiện chất lượng camera ${camera.camera_name}`;
          const message = result.confidenceImpact;

          const meta = JSON.stringify({
            bullets: result.bullets,
            camera_id: camera.camera_id,
            location: camera.location_in_room || camera.camera_name,
            brightness: result.brightness,
            quality_level: result.qualityLevel,
            analysis_date: new Date().toISOString(),
          });

          const metaObj = JSON.parse(meta);
          
          await this.suggestionRepo.upsertSuggestion({
            user_id: userId,
            resource_type: 'camera',
            resource_id: camera.camera_id,
            type: SuggestionCategory.DEVICE_CHECK,
            title,
            message,
            meta: metaObj,
          });

          this.logger.log(
            `Upserted device check suggestion for ${camera.camera_name}`,
          );
        } else {
          this.logger.log(
            `Skipping ${camera.camera_name}: excellent quality (${result.brightness}%)`,
          );
        }
      }

      this.logger.log(`Completed device check analysis for user: ${userId}`);
      return debug ? { ...debugInfo, success: true, message: 'Analysis completed' } : undefined;
    } catch (error) {
      this.logger.error(
        `Failed to analyze device check for user ${userId}: ${error.message}`,
        error.stack,
      );
      if (debug) {
        return { ...debugInfo, success: false, error: error.message, stack: error.stack };
      }
    }
  }

  /**
   * Analyze sleep quality for a user based on patient_sleep_checkins data
   */
  async analyzeSleepQualityForUser(userId: string, days = 7): Promise<void> {
    this.logger.log(`Starting sleep quality analysis for user: ${userId} (${days} days)`);

    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get sleep checkins for the user
      const checkins = await this.prisma.client.patient_sleep_checkins.findMany({
        where: {
          user_id: userId,
          checkin_at: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { checkin_at: 'desc' },
      });

      if (checkins.length === 0) {
        this.logger.log(`No sleep checkins found for user ${userId} in last ${days} days`);
        return;
      }

      this.logger.log(`Found ${checkins.length} sleep checkins for analysis`);

      // Analyze sleep patterns
      const result = await this.sleepAnalyzer.analyzeSleepQuality({
        userId,
        checkins: checkins.map(c => ({
          state: c.state,
          checkin_at: c.checkin_at,
          meta: c.meta,
        })),
        days,
      });

      this.logger.log(
        `Generated sleep analysis (AI: ${result.generatedByAI}): ${result.bullets.length} bullets`,
      );

      // Create suggestion
      const title = 'Cải thiện chất lượng giấc ngủ';
      const message = `Phân tích từ ${result.stats.totalCheckins} lần check-in trong ${days} ngày qua`;

      const meta = {
        bullets: result.bullets,
        generatedByAI: result.generatedByAI,
        stats: result.stats,
        analysis_date: new Date().toISOString(),
        days_analyzed: days,
      };

      await this.suggestionRepo.upsertSuggestion({
        user_id: userId,
        type: SuggestionCategory.SLEEP_QUALITY,
        title,
        message,
        meta,
      });

      this.logger.log(`Upserted sleep quality suggestion for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to analyze sleep quality for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
