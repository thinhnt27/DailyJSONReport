// src/modules/file-manage/application/alarm-notify.consumer.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { EventDetectionsService } from '@/modules/event-detections/application/event-detections.service';
import { PgNotifyProvider } from '@/infra/pg-notify.provider';

@Injectable()
export class AlarmNotifyConsumer implements OnModuleInit {
  private readonly logger = new Logger(AlarmNotifyConsumer.name);
  constructor(
    private readonly pg: PgNotifyProvider,
    private readonly evSvc: EventDetectionsService,
  ) {}
  onModuleInit() {
    this.logger.log('AlarmNotifyConsumer init - subscribe PgNotifyProvider');
    this.pg.onAlarm = (p) =>
      void this.handle(p).catch((err) =>
        this.logger.error('handle alarm failed', err as Error),
      );
  }

  private pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  private noonStr = (y: number, m: number, d: number) =>
    `${y}-${this.pad2(m)}-${this.pad2(d)} 12:00:00+07:00`;
  private ddmmyyyyUTC(d: Date) {
    return `${this.pad2(d.getUTCDate())}-${this.pad2(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
  }

  private async handle(payload: {
    user_id?: string;
    detected_at?: string;
    bucket_day?: string;
  }) {
    const uid = (payload.user_id ?? '').replace(/[^\w-]/g, '');
    if (!uid) return;

    // Ưu tiên bucket_day (YYYY-MM-DD) từ DB; nếu thiếu thì fallback từ detected_at
    let y: number, m: number, d: number;
    if (payload.bucket_day) {
      const [yy, mm, dd] = payload.bucket_day
        .split('-')
        .map((x) => parseInt(x, 10));
      if (!yy || !mm || !dd) return;
      y = yy;
      m = mm;
      d = dd;
    } else if (payload.detected_at) {
      // Quy tắc 12:00 VN ở BE (fallback)
      const det = new Date(payload.detected_at);
      const vnMs = det.getTime() + 7 * 3600_000;
      const bucketMs = vnMs - 12 * 3600_000;
      const utc = new Date(bucketMs - 7 * 3600_000);
      y = utc.getUTCFullYear();
      m = utc.getUTCMonth() + 1;
      d = utc.getUTCDate();
    } else return;

    // 1) Xoá file ngày: data/analyses/{userId}/{dd-MM-yyyy}.json
    const dayUTC = new Date(Date.UTC(y, m - 1, d));
    const fileName = this.ddmmyyyyUTC(dayUTC);
    const baseDir = process.env.FILE_BASE_DIR?.trim() || 'src/data';
    const fullPath = join(
      process.cwd(),
      baseDir,
      'analyses',
      uid,
      `${fileName}.json`,
    );
    try {
      await fs.unlink(fullPath);
      this.logger.log(`Removed ${fullPath}`);
    } catch {
      this.logger.log(`No file to remove: ${fullPath}`);
    }

    // 2) Rebuild cửa sổ trưa→trưa bao trùm bucket-day
    const fromStr = this.noonStr(y, m, d);
    const next = new Date(Date.UTC(y, m - 1, d) + 24 * 3600_000);
    const toStr = this.noonStr(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
    );
    this.logger.log(`Rebuild user=${uid} from=${fromStr} to=${toStr}`);
    await this.evSvc.fetchEventsAndHabitsByRanges(fromStr, toStr);
  }
}
