// src/modules/event-detections/application/helpers/batch-group.helper.ts
import { Decimal } from '@prisma/client/runtime/library';
type EventStatus = 'normal' | 'warning' | 'danger';

type MinimalShape = {
  user_id?: string | null;
  status?: EventStatus | null;
  created_at?: string | Date | null;
  detected_at?: string | Date | null;
  event_description?: string | null;
  confidence_score?: Decimal | number | null;
  validated_by?: string | null;
  // thêm field...
};

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MAX_SEND = 20;

function getTimeMs(raw?: string | Date | null): number {
  const d = typeof raw === 'string' ? new Date(raw) : (raw ?? null);
  return d instanceof Date && !Number.isNaN(d.getTime())
    ? d.getTime()
    : Number.NaN;
}

function isNonNormal(s?: string | null): boolean {
  return (s ?? '').toLowerCase() !== 'normal' && (s ?? '') !== '';
}

// Generic T: chỉ cần thỏa MinimalShape là được; trả về cùng T[][]
export function buildSendBatchesByStatusAndGap<T extends MinimalShape>(
  events: T[],
): T[][] {
  // 1) bỏ Normal + có thời gian hợp lệ (ưu tiên created_at, fallback detected_at)
  const filtered = events
    .map((e) => {
      const t = getTimeMs(e.created_at ?? e.detected_at);
      return { e, t };
    })
    .filter((x) => isNonNormal(x.e.status) && Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);

  // 2) group theo status
  const byStatus = new Map<string, Array<{ e: T; t: number }>>();
  for (const item of filtered) {
    const key = String(item.e.status ?? 'unknown');
    (byStatus.get(key) ?? byStatus.set(key, []).get(key)!).push(item);
  }

  // 3) trong mỗi status, group theo khoảng cách ≤ 5 phút, rồi cắt ≤ 20 record
  const out: T[][] = [];

  for (const [, list] of byStatus) {
    if (list.length === 0) continue;

    let current: T[] = [list[0].e];
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1].t;
      const cur = list[i].t;
      if (cur - prev <= FIVE_MINUTES_MS) {
        current.push(list[i].e);
      } else {
        while (current.length > MAX_SEND) out.push(current.splice(0, MAX_SEND));
        out.push(current);
        current = [list[i].e];
      }
    }
    while (current.length > MAX_SEND) out.push(current.splice(0, MAX_SEND));
    out.push(current);
  }

  return out;
}
