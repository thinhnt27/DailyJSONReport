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
import { SuggestionCategory } from '../domain/suggestion.entity';
import type { suggestions } from '@prisma/client';

@Injectable()
export class SuggestionService {
  private readonly logger = new Logger(SuggestionService.name);

  constructor(
    @Inject(SUGGESTION_REPO)
    private readonly suggestionRepo: ISuggestionRepo,
    @Inject(EVENT_DETECTIONS_REPO)
    private readonly eventRepo: IEventDetectionsRepo,
    private readonly analyzer: SuggestionAnalyzerService,
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
}
