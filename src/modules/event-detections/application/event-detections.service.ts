import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FetchEventsOptions } from '../domain/event-detections';
import { fetchEventsAndPatientHabits } from '../domain/event-detections';
import type {
  FetchResult,
  IEventDetectionsRepo,
} from '../domain/repositories/event-detections.repo.interface';
import { EVENT_DETECTIONS_REPO } from '../domain/repositories/event-detections.repo.interface';
import { LmStudioService } from '@modules/lm-studio/application/lmstudio.service';
import { AiUserAnalysis } from '@modules/lm-studio/interface/dto/ai-user-analysis.dto';

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

  // AI analysis
  async fetchEventsAndAnalyze(
    endDateIso?: string,
    options?: FetchEventsOptions,
  ): Promise<AiUserAnalysis[]> {
    const raw = await this.fetchEventsAndHabits(endDateIso, options);
    this.logger.debug('Raw events fetched for analysis', raw);

    // Call LM Studio and defensively validate the response to avoid unsafe any
    let analyzed: AiUserAnalysis[] = [];
    try {
      if (
        this.lmStudio &&
        typeof (this.lmStudio as unknown as Record<string, unknown>)
          .analyzeEventData === 'function'
      ) {
        const result = await (
          this.lmStudio as unknown as {
            analyzeEventData(payload: unknown): Promise<unknown>;
          }
        ).analyzeEventData(raw as any);

        if (Array.isArray(result)) {
          analyzed = result as AiUserAnalysis[];
        } else {
          this.logger.warn(
            'LmStudioService returned non-array result; returning empty array',
          );
        }
      } else {
        this.logger.warn(
          'LmStudioService or its "analyzeEventData" method is not available; skipping analysis',
        );
      }
    } catch (err) {
      this.logger.error('LmStudio analysis failed', err as Error | string);
      analyzed = [];
    }

    return analyzed; // đã parse JSON và kiểm tra là array ở đây
    // return []; // tạm thời chưa gọi LM Studio
  }
}
