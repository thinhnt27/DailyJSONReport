// src/modules/event-detections/application/helpers/users-batch-grouper.ts

export type StatusLower = 'normal' | 'warning' | 'danger';

export type InputEvent = {
  event_id?: string | null;
  notes?: string | null;
  user_id?: string | null;
  event_type?: string | null;
  event_description?: string | null;
  confidence_score?: string | number | { toNumber?: () => number } | null;
  verified_by?: string | null;
  confirm_status?: boolean | null;
  status?: string | null; // có thể 'Normal'/'normal'/null
  created_at?: string | Date | null;
  detected_at?: string | Date | null;
} & Record<string, unknown>;

export type InputUser = {
  user_id: string;
  'event-detections': InputEvent[];
  supplement: Record<string, unknown> | null;
};

export type OutputBatch = {
  user_id: string;
  'event-detections': InputEvent[]; // giữ nguyên shape event (chỉ normalize giá trị)
  supplement: Record<string, unknown> | null;
};

export type GroupOptions = {
  /** Status được giữ lại để gom nhóm (lowercase). Mặc định: ['warning','danger'] */
  includeStatuses?: string[];
  /** Có lọc bỏ 'normal' không? Mặc định true */
  excludeNormal?: boolean;
  /** Khoảng kề nhau để gộp (ms). Mặc định 5 phút */
  timeGapMs?: number;
  /** Số record tối đa mỗi batch. Mặc định 20 */
  maxBatchSize?: number;
  /**
   * Nếu đặt, sẽ GÁN lại status của mọi event trong batch về giá trị này
   * (vd 'danger'), chỉ ảnh hưởng dữ liệu trả ra, không đổi dữ liệu gốc.
   */
  forceStatusOutput?: string | null;
};

const DEFAULTS: Required<
  Pick<GroupOptions, 'excludeNormal' | 'timeGapMs' | 'maxBatchSize'>
> = {
  excludeNormal: true,
  timeGapMs: 5 * 60 * 1000, // 5 phút
  maxBatchSize: 20,
};

function toLower(s?: string | null): string {
  return (s ?? '').toLowerCase();
}

function parseDateMs(raw?: string | Date | null): number {
  const d = typeof raw === 'string' ? new Date(raw) : (raw ?? null);
  return d instanceof Date && !Number.isNaN(d.getTime())
    ? d.getTime()
    : Number.NaN;
}

function isDecimalLike(v: unknown): v is { toNumber: () => number } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'toNumber' in (v as Record<string, unknown>) &&
    typeof (v as { toNumber?: unknown }).toNumber === 'function'
  );
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (isDecimalLike(v)) {
    try {
      const n = v.toNumber();
      return typeof n === 'number' && Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Chuẩn hoá event: lowercase status, convert confidence_score → number, chuẩn hoá time field */
function normalizeEvent(
  e: InputEvent,
): InputEvent & { _ts: number; _status: string } {
  const normalizedStatus = toLower(e.status);
  const ts = parseDateMs(e.detected_at ?? e.created_at);

  // Không thay đổi shape ban đầu; chỉ chuẩn hoá giá trị phổ biến
  const confidenceNumber = toNumberOrNull(e.confidence_score);

  return {
    ...e,
    status: normalizedStatus || null, // vẫn giữ field status nhưng lowercase
    confidence_score: confidenceNumber ?? e.confidence_score, // nếu parse được thì thay
    _ts: ts, // timestamp phục vụ sort/group
    _status: normalizedStatus, // status lowercase để group
  };
}

/** Chia nhỏ mảng thành các chunk size tối đa */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Strip field nội bộ type-safe */
type WithInternal = InputEvent & { _ts?: number; _status?: string };
function stripInternal<E extends WithInternal>(e: E): InputEvent {
  const { _ts: _ignoredTs, _status: _ignoredStatus, ...rest } = e;
  return rest as InputEvent;
}

/** Gom theo status + khoảng cách time; sau đó cắt ≤ maxBatchSize */
function groupOneUser(user: InputUser, opt?: GroupOptions): OutputBatch[] {
  const includeStatuses = opt?.includeStatuses?.map(toLower);
  const excludeNormal = opt?.excludeNormal ?? DEFAULTS.excludeNormal;
  const timeGapMs = opt?.timeGapMs ?? DEFAULTS.timeGapMs;
  const maxBatchSize = opt?.maxBatchSize ?? DEFAULTS.maxBatchSize;
  const forceStatus = opt?.forceStatusOutput
    ? toLower(opt.forceStatusOutput)
    : null;

  // 1) Normalize + sort theo detected_at (fallback created_at)
  const events = (user['event-detections'] ?? []).map(normalizeEvent);
  events.sort((a, b) => a._ts - b._ts);

  // 2) Lọc theo status
  const filtered = events
    .filter((e) => {
      const st = e._status; // lowercase
      if (includeStatuses && includeStatuses.length > 0) {
        return includeStatuses.includes(st);
      }
      // ✅ chỉ loại 'normal', giữ lại rỗng/null
      if (excludeNormal) return st !== 'normal';
      return true;
    })
    .filter((e) => Number.isFinite(e._ts)); // bỏ event không có timestamp hợp lệ

  // 3) Group theo status → rồi group “kề nhau ≤ timeGapMs”
  const byStatus = new Map<
    string,
    (InputEvent & { _ts: number; _status: string })[]
  >();
  for (const ev of filtered) {
    const key = ev._status || 'unknown';
    (byStatus.get(key) ?? byStatus.set(key, []).get(key)!).push(ev);
  }

  const batches: OutputBatch[] = [];

  for (const [, list] of byStatus) {
    if (list.length === 0) continue;

    let current: InputEvent[] = [list[0]];
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]._ts;
      const cur = list[i]._ts;
      if (cur - prev <= timeGapMs) {
        current.push(list[i]);
      } else {
        // push nhóm cũ (cắt nhỏ nếu cần)
        for (const part of chunk(current, maxBatchSize)) {
          const cooked = forceStatus
            ? part.map((ev) => ({ ...ev, status: forceStatus }))
            : part.map((ev) => ({ ...ev })); // clone nhẹ
          batches.push({
            user_id: user.user_id,
            'event-detections': cooked,
            supplement: user.supplement ?? null,
          });
        }
        current = [list[i]];
      }
    }
    // push nhóm cuối
    for (const part of chunk(current, maxBatchSize)) {
      const cooked = forceStatus
        ? part.map((ev) => ({ ...ev, status: forceStatus }))
        : part.map((ev) => ({ ...ev }));
      batches.push({
        user_id: user.user_id,
        'event-detections': cooked,
        supplement: user.supplement ?? null,
      });
    }
  }

  // 4) Loại bỏ các field nội bộ (_ts, _status) khỏi output — type-safe
  for (const b of batches) {
    b['event-detections'] = b['event-detections'].map(stripInternal);
  }

  return batches;
}

/**
 * Public API: nhận mảng users (như JSON bạn đưa), trả về danh sách batch đã chia:
 *   [{ user_id, "event-detections": [...≤20], supplement }, ...]
 */
export class UsersBatchGrouper {
  static group(users: InputUser[], options?: GroupOptions): OutputBatch[] {
    const out: OutputBatch[] = [];
    for (const u of users) {
      const grouped = groupOneUser(u, options);
      out.push(...grouped);
    }
    // sort toàn cục theo thời gian batch đầu
    out.sort((a, b) => {
      const a0 = a['event-detections']?.[0];
      const b0 = b['event-detections']?.[0];
      const ta = a0?.detected_at ?? a0?.created_at;
      const tb = b0?.detected_at ?? b0?.created_at;
      return parseDateMs(ta ?? null) - parseDateMs(tb ?? null);
    });
    console.log(
      `UsersBatchGrouper.group: total users=${users.length}, batches=${out.length}`,
    );
    return out;
  }
}
