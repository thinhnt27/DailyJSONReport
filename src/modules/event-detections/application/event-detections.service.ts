import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FetchEventsOptions } from '../domain/event-detections';
import { fetchEventsAndPatientHabits } from '../domain/event-detections';
import type {
  FetchResult,
  IEventDetectionsRepo,
} from '../domain/repositories/event-detections.repo.interface';
import { EVENT_DETECTIONS_REPO } from '../domain/repositories/event-detections.repo.interface';
import { LmStudioService } from '@/modules/lm-studio/application/lmstudio.service';
import { AiUserAnalysis } from '@/modules/lm-studio/interface/dto/ai-user-analysis.dto';

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
  ): Promise<AiUserAnalysis[]> {
    const raw = await this.fetchEventsAndHabits(endDateIso, options);

    const events = raw['event-detections'] ?? [];
    const habits = raw['patient-habits'] ?? [];

    // 🔹 Lấy danh sách user_id duy nhất
    const userIds = Array.from(
      new Set(habits.map((e) => e.user_id).filter(Boolean)),
    );

    const allResults: AiUserAnalysis[] = [];

    for (const userId of userIds) {
      // Lọc event và habit theo từng user
      const userEvents = events.filter((e) => e.user_id === userId);
      const userHabits = habits.filter((h) => h.user_id === userId);

      console.log(
        `Processing user_id=${userId} with ${userEvents.length} events and ${userHabits.length} habits`,
      );

      // Nếu user có quá nhiều event, chia nhỏ ra batch
      const batchSize = 40; // <— thử điều chỉnh 20–50 để tránh tràn context
      const userResults: AiUserAnalysis[] = [];

      for (let i = 0; i < userEvents.length; i += batchSize) {
        const eventBatch = userEvents.slice(i, i + batchSize);

        const userRawData = {
          'event-detections': eventBatch,
          'patient-habits': userHabits,
        };

        try {
          console.log(
            `→ Sending batch (${i / batchSize + 1}) of ${eventBatch.length} events for user ${userId}`,
          );
          console.log(`userRawData: from ${i / batchSize + 1} `, userRawData);
          const analyzed = await this.lmStudio.analyzeEventData(userRawData);

          // Lưu kết quả mỗi batch (có thể trả về 1 hoặc nhiều record)
          if (Array.isArray(analyzed)) {
            userResults.push(...analyzed);
          } else {
            userResults.push(analyzed);
          }
        } catch (err) {
          console.error(
            `LM Studio failed for user ${userId} (batch ${i / batchSize + 1}):`,
            err,
          );
        }
      }

      // 🔹 Nếu có nhiều batch → có thể merge logic nếu trùng user_id
      // Ví dụ: chỉ lấy status nặng nhất (Danger > Warning > Normal)
      const merged = this.mergeUserAnalyses(userResults);
      allResults.push(merged);
    }

    return allResults;
  }

  /**
   * Hàm hợp nhất kết quả các batch cùng user (nếu model trả về nhiều record)
   */
  private mergeUserAnalyses(results: AiUserAnalysis[]): AiUserAnalysis {
    if (results.length === 0) {
      return {
        user_id: 'unknown',
        habit_type: '',
        habit_name: '',
        description: '',
        dailyActivityLog: {
          start_time: '',
          end_time: '',
          status: 'Normal',
        },
        mostActivePeriod: '',
        mostAbnormalPeriod: '',
        mostAbnormalEventType: '',
        aiSummary: '',
        actionSuggestion: '',
      };
    }

    // Chọn record có mức độ cao nhất (Danger > Warning > Normal)
    const priority = { Danger: 3, Warning: 2, Normal: 1 };
    return results.reduce((best, current) => {
      const b = best.dailyActivityLog.status;
      const c = current.dailyActivityLog.status;
      return priority[c] > priority[b] ? current : best;
    });
  }
}
