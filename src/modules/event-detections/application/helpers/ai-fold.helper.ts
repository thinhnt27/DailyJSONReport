import type { AiUserAnalysis } from '@/modules/lm-studio/interface/dto/ai-user-analysis.dto';
import type {
  AiUserAnalysisV2,
  DailyLogItem,
  Status,
} from '@/modules/lm-studio/interface/dto/ai-user-analysis.v2.dto';

const priority: Record<Status, number> = { Danger: 3, Warning: 2, Normal: 1 };

function mergeAdjacent(segments: DailyLogItem[]): DailyLogItem[] {
  if (segments.length <= 1) return segments;
  const sorted = [...segments].sort(
    (a, b) => Date.parse(a.start_time) - Date.parse(b.start_time),
  );
  const out: DailyLogItem[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    const contiguous = Date.parse(prev.end_time) === Date.parse(cur.start_time);
    const same =
      prev.status === cur.status &&
      prev.aiSummary === cur.aiSummary &&
      prev.actionSuggestion === cur.actionSuggestion;
    if (contiguous && same) {
      prev.end_time = cur.end_time; // nối đuôi
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

function hhmmRange(startIso: string, endIso: string) {
  const toVN = (d: Date) => new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  const s = toVN(new Date(startIso)),
    e = toVN(new Date(endIso));
  return `${fmt(s)}-${fmt(e)}`;
}

function pickMostActive(segments: DailyLogItem[]): string | undefined {
  if (!segments.length) return;
  let best = segments[0],
    bestDur = Date.parse(best.end_time) - Date.parse(best.start_time);
  for (let i = 1; i < segments.length; i++) {
    const dur =
      Date.parse(segments[i].end_time) - Date.parse(segments[i].start_time);
    if (dur > bestDur) {
      best = segments[i];
      bestDur = dur;
    }
  }
  return hhmmRange(best.start_time, best.end_time);
}

function pickMostAbnormal(segments: DailyLogItem[]): string | undefined {
  if (!segments.length) return;
  let best = segments[0];
  let score = priority[best.status];
  let dur = Date.parse(best.end_time) - Date.parse(best.start_time);
  for (let i = 1; i < segments.length; i++) {
    const sc = priority[segments[i].status];
    const du =
      Date.parse(segments[i].end_time) - Date.parse(segments[i].start_time);
    if (sc > score || (sc === score && du > dur)) {
      best = segments[i];
      score = sc;
      dur = du;
    }
  }
  return hhmmRange(best.start_time, best.end_time);
}

/**
 * Gộp danh sách AiUserAnalysis (mỗi phần tử là 1 đoạn) thành 1 AiUserAnalysisV2 (nhiều đoạn)
 * - Giữ nguyên user/habit/description từ phần tử đầu
 * - Segment = {start/end/status} + {aiSummary/actionSuggestion} của từng phần tử
 * - Merge các đoạn liền kề có cùng nội dung
 */
export function foldUserAnalysesToV2(
  results: AiUserAnalysis[],
): AiUserAnalysisV2 {
  if (results.length === 0) {
    return {
      user_id: 'unknown',
      habit_type: '',
      habit_name: '',
      description: '',
      dailyActivityLog: [],
    };
  }

  const head = results[0];
  const segments: DailyLogItem[] = results.map((r) => ({
    start_time: r.dailyActivityLog.start_time,
    end_time: r.dailyActivityLog.end_time,
    status: r.dailyActivityLog.status as Status,
    aiSummary: r.aiSummary,
    actionSuggestion: r.actionSuggestion,
  }));

  const merged = mergeAdjacent(segments);

  return {
    user_id: head.user_id,
    habit_type: head.habit_type,
    habit_name: head.habit_name,
    description: head.description,
    dailyActivityLog: merged,
    mostActivePeriod: pickMostActive(merged),
    mostAbnormalPeriod: pickMostAbnormal(merged),
    // mostAbnormalEventType:
  };
}
