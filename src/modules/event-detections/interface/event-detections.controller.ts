import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { EventDetectionsService } from '../application/event-detections.service';
import type { FetchResult } from '../domain/repositories/event-detections.repo.interface';
import { FetchEventsQueryDto } from './dto/fetch-events.dto';
// import { AiUserAnalysis } from '@/modules/lm-studio/interface/dto/ai-user-analysis.dto';
import { AiUserAnalysisV2 } from '@/modules/lm-studio/interface/dto/ai-user-analysis.v2.dto';

@Controller('event-detections')
export class EventDetectionsController {
  constructor(private readonly service: EventDetectionsService) {}

  @Get()
  fetchEventsAndHabits(
    @Query() query: FetchEventsQueryDto,
  ): Promise<FetchResult> {
    // Convert string query params to proper types
    const limit = query.limit ? Number(query.limit) : undefined;
    const page = query.page ? Number(query.page) : undefined;
    const fetchAll =
      query.fetchAll === true ||
      (query.fetchAll as unknown as string) === 'true';

    return this.service.fetchEventsAndHabits(query.endDate, {
      limit,
      page,
      eventFields: query.eventFields,
      habitFields: query.habitFields,
      saveToFile: query.saveToFile,
      filename: query.filename,
      fetchAll,
    });
  }

  @Get('analyze')
  async analyze(): Promise<AiUserAnalysisV2[]> {
    return await this.service.fetchEventsAndAnalyze();
  }

  @Get('health')
  health(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  // @Post('trigger')
  // async triggerNow(): Promise<Array<Record<string, unknown>>> {
  //   // Trigger analysis immediately for testing purposes (matches cron)
  //   // return this.service.fetchEventsAndAnalyze();
  // }

  @Post('analyze-to-file')
  @HttpCode(200)
  async analyzeAndSave(): Promise<{ status: 'ok'; saved: true; at: string }> {
    await this.service.fetchEventsAndAnalyzeToFile();
    return { status: 'ok', saved: true, at: new Date().toISOString() };
  }

  private pad2(n: number) {
    return n < 10 ? `0${n}` : `${n}`;
  }

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
  @Get('test-data')
  getTestData(): Promise<any> {
    const { y, m, d } = this.getVnYmd();
    const toStr = this.noonString(y, m, d);

    // "Hôm qua" theo VN: tạo Date từ chuỗi toStr rồi trừ 1 ngày
    const toDate = new Date(`${toStr.replace(' ', 'T')}`); // => 2025-10-14T12:00:00+07:00
    const fromDate = new Date(toDate.getTime() - 24 * 3600_000);

    const { y: fy, m: fm, d: fd } = this.getVnYmd(fromDate);
    const fromStr = this.noonString(fy, fm, fd);
    return this.service.fetchEventsAndHabitsByRangesV2(fromStr, toStr);
  }
}
