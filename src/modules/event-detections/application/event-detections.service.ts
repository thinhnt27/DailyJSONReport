import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FetchEventsOptions } from '../domain/event-detections';
import { fetchEventsAndPatientHabits } from '../domain/event-detections';
import type {
  FetchResult,
  IEventDetectionsRepo,
} from '../domain/repositories/event-detections.repo.interface';
import { EVENT_DETECTIONS_REPO } from '../domain/repositories/event-detections.repo.interface';
import { LmStudioService } from './lmstudio.service';
import { AiUserAnalysis } from '../interface/dto/ai-user-analysis.dto';

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
    console.log(raw);
    const analyzed = await this.lmStudio.analyzeEventData(raw);
    return analyzed; // đã parse JSON và kiểm tra là array ở LmStudioService
    // return []; // tạm thời chưa gọi LM Studio
  }
}
