import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventDetectionsService } from './event-detections.service';

/**
 * EventDetectionsScheduler
 *
 * Runs periodically to fetch events and run AI analysis. Schedule uses
 * CronExpression.EVERY_DAY_AT_1AM by default. This can be changed later
 * to read from configuration or environment variables.
 */
@Injectable()
export class EventDetectionsScheduler {
  private readonly logger = new Logger(EventDetectionsScheduler.name);

  constructor(private readonly svc: EventDetectionsService) {}

  // Runs daily at 01:00 server time. Update to use a config value if needed.
  //   @Cron(CronExpression.EVERY_DAY_AT_1AM)
  //   async handleDailyAnalysis() {
  //     this.logger.log('Starting daily event detection job');
  //     try {
  //       const users = await this.svc.fetchEventsAndAnalyze();
  //       // Count total events across all users
  //       const count = Array.isArray(users)
  //         ? users.reduce((acc, u) => {
  //             const ev = u['event-detections'];
  //             if (Array.isArray(ev)) return acc + ev.length;
  //             return acc;
  //           }, 0)
  //         : 0;
  //       this.logger.log(
  //         `Daily event detection completed; processed ${count} events`,
  //       );
  //     } catch (err) {
  //       this.logger.error('Daily event detection failed', err as Error | string);
  //     }
  //   }

  //   // Expose a manual trigger that can be used from other services or tests
  //   async triggerNow() {
  //     this.logger.log('Manual trigger invoked for event detection');
  //     return this.handleDailyAnalysis();
  //   }

  // Test cron: chạy mỗi 5 giây
  // @Cron('*/5 * * * * *') // <-- mỗi 5 giây
  // handleTestCron() {
  //   this.logger.log('Test cron running every 5s');
  //   const { y, m, d } = this.getVnYmd();
  //   const toStr = this.noonString(y, m, d);

  //   // "Hôm qua" theo VN: tạo Date từ chuỗi toStr rồi trừ 1 ngày
  //   const toDate = new Date(`${toStr.replace(' ', 'T')}`); // => 2025-10-14T12:00:00+07:00
  //   const fromDate = new Date(toDate.getTime() - 24 * 3600_000);
  //   this.logger.log(
  //     `Test cron: from=${fromDate.toISOString()} to=${toDate.toISOString()}`,
  //   );
  // }

  /** Utils: tạo chuỗi 'YYYY-MM-DD 12:00:00+07:00' cho hôm nay/hôm qua theo giờ VN */
  private pad2(n: number) {
    return n < 10 ? `0${n}` : `${n}`;
  }

  /** Lấy yyyy-mm-dd theo múi giờ VN từ Date.now() */
  private getVnYmd(date = new Date()) {
    // dịch sang giờ VN để lấy đúng *ngày* theo VN
    const vn = new Date(date.getTime() + 7 * 3600_000);
    const y = vn.getUTCFullYear();
    const m = this.pad2(vn.getUTCMonth() + 1);
    const d = this.pad2(vn.getUTCDate());
    return { y, m, d };
  }

  /** Chuẩn hoá chuỗi 12h trưa cho một ngày (theo VN) */
  private noonString(y: number, m: string | number, d: string | number) {
    const mm = typeof m === 'number' ? this.pad2(m) : m;
    const dd = typeof d === 'number' ? this.pad2(d) : d;
    return `${y}-${mm}-${dd} 12:00:00+07:00`;
  }

  // Chạy MỖI NGÀY lúc 12:00:00 trưa theo Asia/Ho_Chi_Minh
  @Cron('0 0 12 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async runNoonDailyWindow() {
    // "Hôm nay" theo VN
    this.logger.log(
      `This trigger is running at 12:00 Asia/Ho_Chi_Minh at ${new Date().toISOString()}`,
    );
    const { y, m, d } = this.getVnYmd();
    const toStr = this.noonString(y, m, d);

    // "Hôm qua" theo VN: tạo Date từ chuỗi toStr rồi trừ 1 ngày
    const toDate = new Date(`${toStr.replace(' ', 'T')}`); // => 2025-10-14T12:00:00+07:00
    const fromDate = new Date(toDate.getTime() - 24 * 3600_000);

    const { y: fy, m: fm, d: fd } = this.getVnYmd(fromDate);
    const fromStr = this.noonString(fy, fm, fd);

    this.logger.log(`Noon cron: from=${fromStr} to=${toStr}`);
    await this.svc.fetchEventsAndHabitsByRanges(fromStr, toStr);
    this.logger.log('Noon cron finished.');
  }
}
