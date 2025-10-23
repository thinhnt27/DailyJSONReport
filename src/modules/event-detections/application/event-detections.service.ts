import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FetchEventsOptions } from '../domain/event-detections';
import {
  fetchEventsAndPatientHabits,
  fetchLatestEventsAndPatientHabits,
  fetchEventsAndHabitsByRange,
} from '../domain/event-detections';
import type {
  FetchResult,
  IEventDetectionsRepo,
} from '../domain/repositories/event-detections.repo.interface';
import { EVENT_DETECTIONS_REPO } from '../domain/repositories/event-detections.repo.interface';
import { UsersBatchGrouper } from './helpers/batch-group.helper';
import { LmStudioService } from '@/modules/lm-studio/application/lmstudio.service';
import {
  AiUserAnalysis,
  DailyReportSummary,
} from '@/modules/lm-studio/interface/dto/ai-user-analysis.dto';
import {
  AiUserAnalysisV2,
  DailySummary,
  DayDoc,
  LMStudioRangePayloadA,
} from '@/modules/lm-studio/interface/dto/ai-user-analysis.v2.dto';
import { foldUserAnalysesToV2 } from './helpers/ai-fold.helper';
import { FileManageService } from '@/modules/file-manage/application/file-manage.service';
import { Debug } from '@prisma/client/runtime/library';

@Injectable()
export class EventDetectionsService {
  private readonly logger = new Logger(EventDetectionsService.name);
  constructor(
    @Inject(EVENT_DETECTIONS_REPO) private readonly repo: IEventDetectionsRepo,
    private readonly lmStudio: LmStudioService,
    private readonly files: FileManageService,
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
        `[Batch ${idx + 1}/${targetedBatches.length}] user=${batch.user_id} | events=${batch['event-detections'].length}`,
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

  async fetchEventsAndAnalyzeToFile(): Promise<void> {
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
        `[Batch ${idx + 1}/${targetedBatches.length}] user=${batch.user_id} | events=${batch['event-detections'].length}`,
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

    // // --- GHI FILE JSON, KHÔNG RETURN ---
    // // payload muốn lưu (có thể thêm metadata nếu cần)
    // const payload = {
    //   generated_at: new Date().toISOString(),
    //   total_users: resultsV2.length,
    //   analyses: resultsV2,
    // };

    // // Lưu vào thư mục dạng "dd-MM-yyyy" (đã cấu hình trong FileManageService)
    // const saved = await this.files.saveJson({
    //   subdir: 'analyses', // sẽ ra data/analyses/<dd-MM-yyyy>/...
    //   nameHint: 'resultsV2', // tên gợi ý
    //   data: payload,
    // });

    // this.logger.log(
    //   `Analyses saved: ${saved.filename} (size=${saved.size}B, checksum=${saved.checksum})`,
    // );

    // Lưu theo user: mỗi user 1 file/ngày, nếu đã có file thì merge thêm vào `analyses`
    const writes = await this.files.saveAnalysesByUser({
      items: resultsV2, // mảng kết quả, mỗi item có field user_id
      // date: '13-10-2025',      // (tuỳ chọn) ép ngày; nếu không truyền thì tự lấy ngày hiện tại (Asia/Ho_Chi_Minh)
    });

    this.logger.log(`Wrote ${writes.length} files:`);
    for (const w of writes) {
      this.logger.log(` - ${w.fullPath} (${w.size}B) created=${w.created}`);
    }
  }

  async fetchEventsAndAnalyzeByRangesTest(
    from: string | Date,
    to: string | Date,
  ): Promise<any> {
    const raw = await fetchEventsAndHabitsByRange(this.repo, from, to);
    this.logger.log(`fetchEventsAndHabitsByRanges: ${JSON.stringify(raw)}`);
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
    return users;
  }
  async fetchEventsAndHabitsByRanges(
    from: string | Date,
    to: string | Date,
  ): Promise<void> {
    const raw = await fetchEventsAndHabitsByRange(this.repo, from, to);
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
    // this.logger.log(
    //   `fetchEventsAndAnalyze: total users=${users.length}, batches (warning/danger)=${batchesWarnDanger.length}`,
    // );
    // // các user cần chạy
    // const targetIds = new Set([
    //   '82f8c132-72e0-4c77-97a6-9c2a12dc1c49',
    //   '9943b3a7-ec53-4508-a9c2-39bda13ed6bc',
    // ]);

    // const targetedBatches = batchesWarnDanger.filter(
    //   (b) => b.user_id && targetIds.has(b.user_id),
    // );

    // this.logger.log(
    //   `fetchEventsAndAnalyze: targeted users=${targetIds.size}, targeted batches=${targetedBatches.length}`,
    // );

    for (const [idx, batch] of batchesWarnDanger.entries()) {
      this.logger.debug(
        `[Batch ${idx + 1}/${batchesWarnDanger.length}] user=${batch.user_id} | events=${batch['event-detections'].length}`,
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

    // // --- GHI FILE JSON, KHÔNG RETURN ---
    // // payload muốn lưu (có thể thêm metadata nếu cần)
    // const payload = {
    //   generated_at: new Date().toISOString(),
    //   total_users: resultsV2.length,
    //   analyses: resultsV2,
    // };

    // // Lưu vào thư mục dạng "dd-MM-yyyy" (đã cấu hình trong FileManageService)
    // const saved = await this.files.saveJson({
    //   subdir: 'analyses', // sẽ ra data/analyses/<dd-MM-yyyy>/...
    //   nameHint: 'resultsV2', // tên gợi ý
    //   data: payload,
    // });

    // this.logger.log(
    //   `Analyses saved: ${saved.filename} (size=${saved.size}B, checksum=${saved.checksum})`,
    // );

    // Lưu theo user: mỗi user 1 file/ngày, nếu đã có file thì merge thêm vào `analyses`
    const writes = await this.files.saveAnalysesTriggerByUser({
      items: resultsV2, // mảng kết quả, mỗi item có field user_id
      // date: '13-10-2025',      // (tuỳ chọn) ép ngày; nếu không truyền thì tự lấy ngày hiện tại (Asia/Ho_Chi_Minh)
    });

    this.logger.log(`Wrote ${writes.length} files:`);
    for (const w of writes) {
      this.logger.log(` - ${w.fullPath} (${w.size}B) created=${w.created}`);
    }
  }

  async fetchEventsAndHabitsByRangesV2(
    from: string | Date,
    to: string | Date,
  ): Promise<void> {
    const raw = await fetchEventsAndHabitsByRange(this.repo, from, to);
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

    for (const [idx, batch] of batchesWarnDanger.entries()) {
      this.logger.debug(
        `[Batch ${idx + 1}/${batchesWarnDanger.length}] user=${batch.user_id} | events=${batch['event-detections'].length}`,
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
    this.logger.log(
      `Grouped results by user: ${JSON.stringify(Array.from(byUser.keys()))} users`,
    );

    // Fold từng nhóm → AiUserAnalysisV2[]
    const resultsV2: AiUserAnalysisV2[] = [];
    for (const [, arr] of byUser) {
      const folded: AiUserAnalysisV2 = foldUserAnalysesToV2(arr);
      resultsV2.push(folded);
    }
    this.logger.log(`Folded resultsV2: ${JSON.stringify(resultsV2)}`);

    // === Helpers ngày theo Asia/Ho_Chi_Minh ===
    const formatVN_ddMMyyyy = (d: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
        .format(d)
        .replace(/\//g, '-'); // dd-MM-yyyy

    const shiftDays = (d: Date, n: number) =>
      new Date(d.getTime() + n * 86400000);
    const normalizeDate = (s: string) => s.replace(/\//g, '-'); // dd/MM/yyyy -> dd-MM-yyyy

    // ===== Sau khi bạn đã có: const resultsV2: AiUserAnalysisV2[] =====

    // Quy ước 7 ngày trước: hôm nay-8 .. hôm nay-1  (vd: hôm nay 20/10 → lấy 12/10–19/10)
    const today = new Date();
    const todayStr = formatVN_ddMMyyyy(today);
    const fromStr = formatVN_ddMMyyyy(shiftDays(today, -8));
    const toStr = formatVN_ddMMyyyy(shiftDays(today, -1));

    const suggestList: DailyReportSummary[] = [];
    //
    for (const v2 of resultsV2) {
      const uid = v2.user_id;

      // 1) Lấy history 7 ngày trước đã lưu trên đĩa (kèm data)
      const files = await this.files.listUserJsonByDateRange<{
        user_id: string;
        date: string; // có thể là dd/MM/yyyy trong file
        analyses: AiUserAnalysisV2[]; // mảng V2 theo ngày đó
      }>({
        userId: uid,
        from: fromStr,
        to: toStr,
        includeData: true,
      });
      Debug.log(`Found ${files.length} history files for user=${uid}`);

      // 2) Chuẩn hoá history → DayDoc[] (bỏ ngày không có file)
      // const history: DayDoc[] = files
      //   .filter((f) => !!f.data)
      //   .map((f) => {
      //     const d = normalizeDate(f.data!.date);
      //     const analyses = f.data!.analyses ?? [];
      //     return { user_id: uid, date: d, analyses };
      //   })
      //   .sort((a, b) => a.date.localeCompare(b.date));

      const history: DailySummary[] = files
        .filter((f) => !!f.data)
        .map((f) => {
          const d = normalizeDate(f.data!.date);
          const suggest_summary_daily =
            f
              .data!.analyses.slice()
              .reverse()
              .find((a) => !!a.suggest_summary_daily)?.suggest_summary_daily ??
            '';
          return { date: d, suggest_summary_daily };
        })
        .sort((a, b) => a.date.localeCompare(b.date));

      this.logger.debug(
        `User=${uid} history summaries: ${JSON.stringify(history)}`,
      );

      // 3) Hôm nay dùng ngay V2 vừa fold xong
      const todayDoc: DayDoc = {
        user_id: uid,
        date: todayStr, // nếu muốn “hôm nay = toStr” thì đổi thành toStr
        analyses: [v2],
      };

      // 4) Payload và gửi sang LM Studio
      const a: LMStudioRangePayloadA = {
        user_id: uid,
        window: { from: fromStr, to: toStr },
        today: todayDoc,
        history,
      };

      const resp = await this.lmStudio.analyzeEventDataV2(a);
      this.logger.debug(
        `LMStudio payload sent (user=${uid}): ${JSON.stringify(a)}...`,
      );
      this.logger.debug(
        `LMStudio response (user=${uid}): ${JSON.stringify(resp)}...`,
      );

      // Kiểm tra type an toàn
      if (
        resp &&
        typeof resp === 'object' &&
        typeof resp.user_id === 'string' &&
        typeof resp.suggest_summary_daily === 'string'
      ) {
        suggestList.push({
          user_id: resp.user_id,
          suggest_summary_daily: resp.suggest_summary_daily,
        });
      }
    }

    for (const v2 of resultsV2) {
      const match = suggestList.find((s) => s.user_id === v2.user_id);
      if (match) {
        v2.suggest_summary_daily = match.suggest_summary_daily;
      }
    }

    // Lưu theo user: mỗi user 1 file/ngày, nếu đã có file thì merge thêm vào `analyses`
    const writes = await this.files.saveAnalysesTriggerByUser({
      items: resultsV2, // mảng kết quả, mỗi item có field user_id
      // date: '13-10-2025',      // (tuỳ chọn) ép ngày; nếu không truyền thì tự lấy ngày hiện tại (Asia/Ho_Chi_Minh)
    });

    this.logger.log(`Wrote ${writes.length} files:`);
    for (const w of writes) {
      this.logger.log(` - ${w.fullPath} (${w.size}B) created=${w.created}`);
    }
  }
}
