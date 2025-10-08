import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FetchEventsOptions } from '../domain/event-detections';
import {
  fetchEventsAndPatientHabits,
  fetchLatestEventsAndPatientHabits,
} from '../domain/event-detections';
import type {
  FetchResult,
  IEventDetectionsRepo,
} from '../domain/repositories/event-detections.repo.interface';
import { EVENT_DETECTIONS_REPO } from '../domain/repositories/event-detections.repo.interface';
import { LmStudioService } from '@/modules/lm-studio/application/lmstudio.service';
import { AiUserAnalysis } from '@/modules/lm-studio/interface/dto/ai-user-analysis.dto';
import { buildSendBatchesByStatusAndGap } from './helpers/batch-group.helper';
import { AiUserAnalysisV2 } from '@/modules/lm-studio/interface/dto/ai-user-analysis.v2.dto';
import { foldUserAnalysesToV2 } from './helpers/ai-fold.helper';

@Injectable()
export class EventDetectionsService {
  private readonly logger = new Logger(EventDetectionsService.name);
  constructor(
    @Inject(EVENT_DETECTIONS_REPO) private readonly repo: IEventDetectionsRepo,
    private readonly lmStudio: LmStudioService,
  ) {}

  // Raw DB
  async fetchEventsAndHabits(
    endDateIso?: string,
    options?: FetchEventsOptions,
  ): Promise<FetchResult> {
    return fetchEventsAndPatientHabits(
      this.repo,
      endDateIso,
      options,
      this.logger,
    );
  }

  async fetchEventsAndAnalyze(
    endDateIso?: string,
    options?: FetchEventsOptions,
  ): Promise<AiUserAnalysisV2[]> {
    const raw = await fetchLatestEventsAndPatientHabits(this.repo, this.logger);

    const events = raw['event-detections'] ?? [];
    const habits = raw['patient-habits'] ?? [];
    this.logger.debug(`Fetched event data: ${events.length} items`);

    const userIds = Array.from(
      new Set(habits.map((e) => e.user_id).filter(Boolean)),
    );

    const allResults: AiUserAnalysisV2[] = [];

    for (const userId of userIds) {
      const userEvents = events.filter((e) => e.user_id === userId);
      const userHabits = habits.filter((h) => h.user_id === userId);

      const sendBatches = buildSendBatchesByStatusAndGap(userEvents);
      const userResults: AiUserAnalysis[] = [];

      for (let b = 0; b < sendBatches.length; b++) {
        const eventBatch = sendBatches[b];
        const userRawData: FetchResult = {
          'event-detections': eventBatch,
          'patient-habits': userHabits,
        };

        try {
          this.logger.debug(
            `→ Sending group ${b + 1}/${sendBatches.length} (size=${eventBatch.length}) for user ${String(userId)}`,
          );
          type EventWithDesc = { event_description?: string | null };

          const events =
            (userRawData['event-detections'] as EventWithDesc[] | undefined) ??
            [];

          const descriptions: string[] = events
            .map((e) => e.event_description)
            .filter((s): s is string => typeof s === 'string' && s.length > 0);

          this.logger.debug(
            `Event descriptions for user ${String(userId)} (${descriptions.length} events):\n` +
              descriptions.join('\n'),
          );

          const analyzed: AiUserAnalysis =
            await this.lmStudio.analyzeEventData(userRawData);
          if (analyzed) userResults.push(analyzed);
        } catch (err: unknown) {
          this.logger.error(
            `LM Studio failed for user ${String(userId)} (group ${b + 1}): ${String(err)}`,
            err instanceof Error ? err.stack : undefined,
          );
        }
      }
      this.logger.debug(
        `Processed user_id=${String(userId)} with ${userResults.length} results and data from userResults (segments): ${JSON.stringify(userResults)}`,
      );

      // Gộp các đoạn cùng user → 1 doc/ngày/người
      const folded: AiUserAnalysisV2 = foldUserAnalysesToV2(userResults);
      allResults.push(folded);
    }

    return allResults;
  }
}
