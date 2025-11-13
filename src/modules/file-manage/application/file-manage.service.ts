// src/modules/file-manage/application/file-manage.service.ts
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createReadStream, promises as fs } from 'fs';
import { join, dirname } from 'path';
import { randomUUID, createHash } from 'crypto';
import { Debug } from '@prisma/client/runtime/library';
import { DayDoc } from '@/modules/lm-studio/interface/dto/ai-user-analysis.v2.dto';
import { LmStudioService } from '@/modules/lm-studio/application/lmstudio.service';

export type SaveJsonInput = {
  subdir?: string; // vẫn dùng được nếu bạn còn cần
  nameHint?: string;
  data: unknown;
};

type SaveByUserInput = {
  /** Mảng kết quả, mỗi item phải có user_id */
  items: unknown[]; // ví dụ: AiUserAnalysisV2[]
  /** Mặc định: ngày hiện tại (Asia/Ho_Chi_Minh), định dạng dd-MM-yyyy */
  date?: string; // nếu bạn muốn ép ngày cụ thể
};

function formatVNDateFolder(d: Date) {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
  return s.replace(/\//g, '-'); // dd-MM-yyyy
}

const SUBDIR_SAFE = /[^\w./-]/g; // không còn lỗi no-useless-escape

function sanitizeUserId(uid: string) {
  // chấp nhận a-zA-Z0-9-_ và dấu gạch dưới; bỏ ký tự lạ để tránh traversal
  return uid.replace(/[^\w-]/g, '');
}

// src/modules/file-manage/application/file-manage.service.ts (bổ sung)
const DATE_DDMMYYYY = /^\d{2}-\d{2}-\d{4}$/;

function ddmmyyyyToUTC(d: string): Date {
  const [dd, mm, yyyy] = d.split('-').map((x) => parseInt(x, 10));
  if (!dd || !mm || !yyyy) throw new BadRequestException('Invalid date');
  return new Date(Date.UTC(yyyy, mm - 1, dd));
}
function toDDMMYYYYFromUTC(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}
function addUTC(d: Date, days: number): Date {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + days);
  return n;
}

function normalizeDateStr(s: string) {
  // đổi dd/MM/yyyy -> dd-MM-yyyy
  return s.replace(/\//g, '-');
}
function toYYYYMMDD(ddmmyyyy: string): string {
  // "17-10-2025" -> "20251017"
  const [dd, mm, yyyy] = ddmmyyyy.split('-');
  return `${yyyy}${mm}${dd}`;
}
// Helper tránh any
function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

// Chuẩn: không dùng any, không truy cập member trực tiếp
function isDayDoc(v: unknown): v is DayDoc {
  if (!isRecord(v)) return false;

  const uid = v['user_id'];
  const date = v['date'];
  const analyses = v['analyses'];

  if (typeof uid !== 'string' || typeof date !== 'string') return false;
  // analyses có thể undefined hoặc mảng
  if (analyses !== undefined && !Array.isArray(analyses)) return false;

  return true;
}

@Injectable()
export class FileManageService {
  constructor(
    @Inject(LmStudioService)
    private readonly lm: LmStudioService,
  ) {}
  // Thư mục trong repo (có thể đổi bằng ENV)
  private readonly baseDir = join(
    process.cwd(),
    process.env.FILE_BASE_DIR?.trim() || 'src/data',
  );

  /** Giữ lại cho các usecase cũ (ghi 1 file bất kỳ) */
  async saveJson(input: SaveJsonInput) {
    const id = randomUUID();
    const subdir = input.subdir?.replace(SUBDIR_SAFE, '') || 'analyses';
    const dateFolder = formatVNDateFolder(new Date());
    const safeName = (input.nameHint ?? 'data').replace(/[^\w.-]+/g, '_');

    // src/data/<subdir>/<dd-MM-yyyy>/<uuid>_<hint>.json
    const relPath = join(subdir, dateFolder, `${id}_${safeName}.json`);
    const fullPath = join(this.baseDir, relPath);

    const jsonBuf = Buffer.from(JSON.stringify(input.data, null, 2), 'utf-8');
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, jsonBuf);

    const checksum = createHash('sha256').update(jsonBuf).digest('hex');
    return {
      id,
      filename: relPath.replace(/\\/g, '/'),
      fullPath,
      size: jsonBuf.length,
      checksum,
    };
  }

  /**
   * Ghi theo user: data/analyses/{userId}/{dd-MM-yyyy}.json
   * - items: mảng trong đó mỗi item phải có field 'user_id'
   * - nếu file tồn tại: merge thêm vào mảng analyses
   * - trả về danh sách file đã ghi theo từng user
   */
  async saveAnalysesByUser(input: SaveByUserInput): Promise<
    Array<{
      userId: string;
      date: string;
      fullPath: string;
      size: number;
      checksum: string;
      created: boolean; // true nếu tạo file mới, false nếu merge
    }>
  > {
    if (!Array.isArray(input.items)) {
      throw new BadRequestException('items must be an array');
    }

    const dateStr =
      input.date && DATE_DDMMYYYY.test(input.date)
        ? input.date
        : formatVNDateFolder(new Date());

    // group theo user_id
    const byUser = new Map<string, unknown[]>();
    for (const it of input.items) {
      const uid = (it as { user_id?: unknown })?.user_id;
      if (typeof uid !== 'string' || uid.length === 0) continue;
      const key = sanitizeUserId(uid);
      if (!byUser.has(key)) byUser.set(key, []);
      byUser.get(key)!.push(it);
    }

    const results: Array<{
      userId: string;
      date: string;
      fullPath: string;
      size: number;
      checksum: string;
      created: boolean;
    }> = [];

    for (const [userId, arr] of byUser) {
      const relPath = join('analyses', userId, `${dateStr}.json`);
      const fullPath = join(this.baseDir, relPath);
      await fs.mkdir(dirname(fullPath), { recursive: true });

      let payload: unknown;
      let created = false;

      // Nếu đã có file → đọc và merge
      try {
        const existBuf = await fs.readFile(fullPath);
        const existText = existBuf.toString('utf-8');
        const existParsed = JSON.parse(existText) as unknown;

        // kỳ vọng shape: { user_id, date, analyses: [] }
        const obj = (existParsed ?? {}) as {
          user_id?: unknown;
          date?: unknown;
          analyses?: unknown;
        };
        const existAnalyses: unknown[] = Array.isArray(obj.analyses)
          ? (obj.analyses as unknown[])
          : [];

        payload = {
          user_id: userId,
          date: dateStr,
          analyses: [...existAnalyses, ...arr],
        };
      } catch {
        // không có file → tạo mới
        payload = {
          user_id: userId,
          date: dateStr,
          analyses: arr,
        };
        created = true;
      }

      const jsonBuf = Buffer.from(JSON.stringify(payload, null, 2), 'utf-8');
      await fs.writeFile(fullPath, jsonBuf); // overwrite an toàn

      const checksum = createHash('sha256').update(jsonBuf).digest('hex');
      results.push({
        userId,
        date: dateStr,
        fullPath,
        size: jsonBuf.length,
        checksum,
        created,
      });
    }

    return results;
  }

  async saveAnalysesTriggerByUser(input: SaveByUserInput): Promise<
    Array<{
      userId: string;
      date: string;
      fullPath: string;
      size: number;
      checksum: string;
      created: boolean;
    }>
  > {
    if (!Array.isArray(input.items)) {
      throw new BadRequestException('items must be an array');
    }

    // ---- Helpers cục bộ ----
    const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    // const parseDdMmYyyyToVnDate = (s: string) => {
    //   // chấp nhận 'dd/MM/yyyy' hoặc 'dd-MM-yyyy'
    //   const sep = s.includes('/') ? '/' : '-';
    //   const [dd, mm, yyyy] = s.split(sep).map((x) => x.trim());
    //   return new Date(`${yyyy}-${pad2(+mm)}-${pad2(+dd)}T00:00:00+07:00`);
    // };
    const parseDdMmYyyyToUtcDate = (s: string): Date => {
      const sep = s.includes('/') ? '/' : '-';
      const [dd, mm, yyyy] = s.split(sep).map((x) => x.trim());
      // Tạo date ở 00:00 UTC (không theo local time)
      return new Date(
        Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), 0, 0, 0),
      );
    };

    /**
     * Format theo dd-MM-yyyy (UTC)
     */
    const formatHyphen = (d: Date): string => {
      const y = d.getUTCFullYear();
      const m = pad2(d.getUTCMonth() + 1);
      const day = pad2(d.getUTCDate());
      return `${day}-${m}-${y}`;
    };

    /**
     * Format theo dd/MM/yyyy (UTC)
     */
    const formatSlash = (d: Date): string => {
      const y = d.getUTCFullYear();
      const m = pad2(d.getUTCMonth() + 1);
      const day = pad2(d.getUTCDate());
      return `${day}/${m}/${y}`;
    };

    /**
     * Lấy ngày cơ sở (UTC), mặc định = ngày hiện tại UTC
     */
    const inputDateStr =
      input.date && DATE_DDMMYYYY.test(input.date)
        ? input.date
        : formatSlash(new Date()); // dd/MM/yyyy theo UTC hiện tại

    // Parse thành Date UTC
    const baseDate =
      input.date && DATE_DDMMYYYY.test(input.date)
        ? parseDdMmYyyyToUtcDate(inputDateStr)
        : parseDdMmYyyyToUtcDate(inputDateStr.replace(/-/g, '/'));

    // Lùi 1 ngày theo UTC
    const prevDate = new Date(baseDate.getTime() - 24 * 3600_000);
    Debug.log(
      `saveAnalysesTriggerByUser: baseDate=${baseDate.toISOString()}, prevDate=${prevDate.toISOString()}`,
    );
    const fileDateStr = formatHyphen(prevDate); // '13-10-2025'
    const payloadDateStr = formatSlash(prevDate); // '13/10/2025'

    // group theo user_id
    const byUser = new Map<string, unknown[]>();
    for (const it of input.items) {
      const uid = (it as { user_id?: unknown })?.user_id;
      if (typeof uid !== 'string' || uid.length === 0) continue;
      const key = sanitizeUserId(uid);
      if (!byUser.has(key)) byUser.set(key, []);
      byUser.get(key)!.push(it);
    }

    const results: Array<{
      userId: string;
      date: string;
      fullPath: string;
      size: number;
      checksum: string;
      created: boolean;
    }> = [];

    for (const [userId, arr] of byUser) {
      const relPath = join('analyses', userId, `${fileDateStr}.json`); // <-- ngày HÔM TRƯỚC
      const fullPath = join(this.baseDir, relPath);
      await fs.mkdir(dirname(fullPath), { recursive: true });

      let payload: unknown;
      let created = false;

      try {
        const existBuf = await fs.readFile(fullPath);
        const existText = existBuf.toString('utf-8');
        const existParsed = JSON.parse(existText) as {
          user_id?: unknown;
          date?: unknown;
          analyses?: unknown;
        };
        const existAnalyses: unknown[] = Array.isArray(existParsed?.analyses)
          ? (existParsed.analyses as unknown[])
          : [];

        payload = {
          user_id: userId,
          date: payloadDateStr, // <-- date trong payload = ngày HÔM TRƯỚC (dd/MM/yyyy)
          analyses: [...existAnalyses, ...arr],
        };
      } catch {
        payload = {
          user_id: userId,
          date: payloadDateStr, // <-- ngày HÔM TRƯỚC
          analyses: arr,
        };
        created = true;
      }

      const jsonBuf = Buffer.from(JSON.stringify(payload, null, 2), 'utf-8');
      await fs.writeFile(fullPath, jsonBuf);

      const checksum = createHash('sha256').update(jsonBuf).digest('hex');
      results.push({
        userId,
        date: payloadDateStr, // trả ra luôn ngày payload cho tiện debug
        fullPath,
        size: jsonBuf.length,
        checksum,
        created,
      });
    }

    return results;
  }

  // ====== CÁC HÀM ĐỌC/TẢI CŨ: chỉnh theo layout mới ======

  /** Lấy đúng file theo user + ngày */
  async findUserJsonPathByDate(userId: string, date: string) {
    if (!DATE_DDMMYYYY.test(date))
      throw new NotFoundException('Invalid date format dd-MM-yyyy');
    const uid = sanitizeUserId(userId);
    const full = join(this.baseDir, 'analyses', uid, `${date}.json`);
    try {
      const st = await fs.stat(full);
      return { name: `${date}.json`, full, mtimeMs: st.mtimeMs, size: st.size };
    } catch {
      throw new NotFoundException(
        `File not found: analyses/${uid}/${date}.json`,
      );
    }
  }

  /** Đọc và parse JSON theo user + ngày */
  async readUserJsonByDate<T = unknown>(input: {
    userId: string;
    date: string;
  }): Promise<{
    filename: string;
    fullPath: string;
    size: number;
    mtimeMs: number;
    data: T;
  }> {
    const f = await this.findUserJsonPathByDate(input.userId, input.date);
    const buf = await fs.readFile(f.full);
    const text = buf.toString('utf-8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new BadRequestException('Invalid JSON content');
    }

    const data = parsed as T;
    return {
      filename: f.name,
      fullPath: f.full,
      size: f.size,
      mtimeMs: f.mtimeMs,
      data,
    };
  }

  /** Stream file thô theo user + ngày */
  async streamUserJsonByDate(input: { userId: string; date: string }) {
    const f = await this.findUserJsonPathByDate(input.userId, input.date);
    return {
      filename: f.name,
      fullPath: f.full,
      size: f.size,
      stream: createReadStream(f.full),
    };
  }

  /**
   * Liệt kê file theo user + khoảng ngày [from..to], có thể kèm data.
   * - Bỏ qua ngày không có file (không throw).
   */
  async listUserJsonByDateRange<T = unknown>(input: {
    userId: string;
    from: string; // dd-MM-yyyy
    to: string; // dd-MM-yyyy
    includeData?: boolean; // mặc định false
  }): Promise<
    Array<{
      date: string;
      filename: string;
      fullPath: string;
      size: number;
      mtimeMs: number;
      data?: T;
    }>
  > {
    const { userId, from, to, includeData = false } = input;
    if (!DATE_DDMMYYYY.test(from) || !DATE_DDMMYYYY.test(to)) {
      throw new BadRequestException('from/to must be dd-MM-yyyy');
    }

    const start = ddmmyyyyToUTC(from);
    const end = ddmmyyyyToUTC(to);
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('from must be <= to');
    }

    const uid = sanitizeUserId(userId);
    const out: Array<{
      date: string;
      filename: string;
      fullPath: string;
      size: number;
      mtimeMs: number;
      data?: T;
    }> = [];

    for (
      let cur = start;
      cur.getTime() <= end.getTime();
      cur = addUTC(cur, 1)
    ) {
      const ds = toDDMMYYYYFromUTC(cur);
      const full = join(this.baseDir, 'analyses', uid, `${ds}.json`);
      try {
        const st = await fs.stat(full);
        const item: {
          date: string;
          filename: string;
          fullPath: string;
          size: number;
          mtimeMs: number;
          data?: T;
        } = {
          date: ds,
          filename: `${ds}.json`,
          fullPath: full,
          size: st.size,
          mtimeMs: st.mtimeMs,
        };
        if (includeData) {
          const text = (await fs.readFile(full)).toString('utf-8');
          const parsed = JSON.parse(text) as unknown;
          item.data = parsed as T; // cast từ unknown (không vi phạm no-unsafe)
        }
        out.push(item);
      } catch {
        // không có file → bỏ qua ngày này
      }
    }

    return out;
  }

  private async archiveOldSummary(uid: string, from: string, to: string) {
    const summaryDir = join(this.baseDir, 'analyses', uid, 'Summary');
    const moveDir = join(this.baseDir, 'analyses', uid, 'Move');

    await fs.mkdir(moveDir, { recursive: true });

    const files = await fs.readdir(summaryDir).catch(() => []);

    // Format YYYYMMDD
    const f = toYYYYMMDD(from);
    const t = toYYYYMMDD(to);
    const pattern = `${f}-${t}.json`;

    for (const file of files) {
      if (file.includes(pattern)) {
        // move file
        const src = join(summaryDir, file);
        const dst = join(moveDir, file);

        await fs.rename(src, dst);
        console.log(`🟡 Archived old summary file: ${file}`);
      }
    }
  }

  async buildAndSaveUserSummaryFromRange(input: {
    userId: string;
    from: string; // dd-MM-yyyy
    to: string; // dd-MM-yyyy
  }): Promise<{
    userId: string;
    from: string;
    to: string;
    filename: string; // Summary/...
    fullPath: string;
    size: number;
    checksum: string;
    daysCount: number;
    totalAnalyses: number;
  }> {
    const { userId, from, to } = input;
    if (!userId) throw new BadRequestException('userId is required');
    if (!DATE_DDMMYYYY.test(from) || !DATE_DDMMYYYY.test(to)) {
      throw new BadRequestException('from/to must be dd-MM-yyyy');
    }
    const start = ddmmyyyyToUTC(from);
    const end = ddmmyyyyToUTC(to);
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('from must be <= to');
    }

    const uid = sanitizeUserId(userId);

    // 1) Đọc dữ liệu ngày trong khoảng (kèm data)
    const items = await this.listUserJsonByDateRange<DayDoc>({
      userId: uid,
      from,
      to,
      includeData: true,
    });

    // 2) Chuẩn hoá thành mảng DayDoc tăng dần theo ngày
    const days: DayDoc[] = items
      .filter((x): x is typeof x & { data: DayDoc } => isDayDoc(x.data))
      .map((x) => {
        const dNorm = normalizeDateStr(x.data.date);
        const analyses = Array.isArray(x.data.analyses) ? x.data.analyses : [];
        return { user_id: uid, date: dNorm, analyses };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const daysCount = days.length;
    const totalAnalyses = days.reduce(
      (sum, d) => sum + (Array.isArray(d.analyses) ? d.analyses.length : 0),
      0,
    );
    // Trước khi gọi LLM, check và chuyển file về Move nếu có
    await this.archiveOldSummary(uid, from, to);
    // 3) Payload tổng
    const llmOutput = await this.lm.analyzeRangeSummaryV1({
      user_id: uid,
      from: start.toISOString(),
      to: end.toISOString(),
      days,
    });

    // Đây là dữ liệu sẽ ghi xuống file
    const payload = llmOutput;

    // 4) Tên file & ghi: data/analyses/{userId}/Summary/summary_{YYYYMMDD}-{YYYYMMDD}.json
    const y1 = toYYYYMMDD(from);
    const y2 = toYYYYMMDD(to);
    const todayStr = toYYYYMMDD(
      `${String(new Date().getDate()).padStart(2, '0')}-${String(
        new Date().getMonth() + 1,
      ).padStart(2, '0')}-${new Date().getFullYear()}`,
    );
    const safeName = `${todayStr}_${y1}-${y2}`;

    const rel = join('analyses', uid, 'Summary', `${safeName}.json`);
    const fullPath = join(this.baseDir, rel);
    await fs.mkdir(dirname(fullPath), { recursive: true });

    const buf = Buffer.from(JSON.stringify(payload, null, 2), 'utf-8');
    await fs.writeFile(fullPath, buf);

    const checksum = createHash('sha256').update(buf).digest('hex');

    return {
      userId: uid,
      from,
      to,
      filename: rel.replace(/\\/g, '/'),
      fullPath,
      size: buf.length,
      checksum,
      daysCount,
      totalAnalyses,
    };
  }
}
