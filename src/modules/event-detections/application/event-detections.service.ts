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
import { UsersBatchGrouper } from './helpers/batch-group.helper';
import { LmStudioService } from '@/modules/lm-studio/application/lmstudio.service';
import { AiUserAnalysis } from '@/modules/lm-studio/interface/dto/ai-user-analysis.dto';
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

  // Parameters intentionally unused here because we always analyze latest data.

  async fetchEventsAndAnalyze(): Promise<AiUserAnalysisV2[]> {
    const raw = await fetchLatestEventsAndPatientHabits(this.repo);
    const userResults: AiUserAnalysis[] = [];
    const events =
      (raw['event-detections'] as Array<Record<string, unknown>>) ?? [];
    const supplementMap =
      (raw.supplement as Record<string, Record<string, unknown>>) ?? {};

    const userIds = Array.from(
      new Set(
        events
          .map((e) => e.user_id as string | undefined)
          .filter((u): u is string => typeof u === 'string' && u.length > 0),
      ),
    );

    const users = userIds.map((uid) => ({
      user_id: uid,
      'event-detections': events.filter((e) => (e.user_id as string) === uid),
      supplement: supplementMap[uid] ?? null,
    }));
    const batchesWarnDanger = UsersBatchGrouper.group(users, {
      excludeNormal: true, // mặc định đã true
    });
    this.logger.log(
      `fetchEventsAndAnalyze: total users=${users.length}, batches (warning/danger)=${batchesWarnDanger.length}`,
    );
    // các user cần chạy
    const targetIds = new Set([
      '82f8c132-72e0-4c77-97a6-9c2a12dc1c49',
      '9943b3a7-ec53-4508-a9c2-39bda13ed6bc',
    ]);

    const targetedBatches = batchesWarnDanger.filter(
      (b) => b.user_id && targetIds.has(b.user_id),
    );

    this.logger.log(
      `fetchEventsAndAnalyze: targeted users=${targetIds.size}, targeted batches=${targetedBatches.length}`,
    );

    for (const [idx, batch] of targetedBatches.entries()) {
      this.logger.debug(
        `🚀 [Batch ${idx + 1}/${targetedBatches.length}] user=${batch.user_id} | events=${batch['event-detections'].length}`,
      );

      // Log payload đẹp, dễ đọc
      this.logger.debug(
        `Batch ${idx + 1} payload:\n${JSON.stringify(batch, null, 2)}`,
      );

      // gọi model
      const out = await this.lmStudio.analyzeEventData(batch);

      // Log kết quả
      this.logger.debug(
        `LM Studio response (batch ${idx + 1}): ${JSON.stringify(out, null, 2)}`,
      );

      // Gom kết quả
      const arr: AiUserAnalysis[] = Array.isArray(out) ? out : [out];
      if (arr) userResults.push(...arr);
    }

    // Gom theo user_id
    const byUser = new Map<string, AiUserAnalysis[]>();

    for (const r of userResults) {
      const uid = r.user_id ?? 'unknown';
      (byUser.get(uid) ?? byUser.set(uid, []).get(uid)!).push(r);
    }

    // Fold từng nhóm → AiUserAnalysisV2[]
    const resultsV2: AiUserAnalysisV2[] = [];
    for (const [, arr] of byUser) {
      const folded: AiUserAnalysisV2 = foldUserAnalysesToV2(arr);
      resultsV2.push(folded);
    }

    // Trả về nếu đây là return của service
    return resultsV2;
  }
}
