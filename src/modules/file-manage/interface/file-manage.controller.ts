// src/modules/file-manage/file-read.controller.ts
import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { FileManageService } from '../application/file-manage.service';
import { ApiQuery } from '@nestjs/swagger';
import { promises as fs } from 'fs';

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}
function hasDaysArray(
  x: unknown,
): x is { days: Array<Record<string, unknown>> } {
  return isRecord(x) && Array.isArray(x.days);
}
function normalizeDateStr(s: string) {
  return s.replace(/\//g, '-');
}
@Controller('file-manage')
export class FileReadController {
  constructor(private readonly files: FileManageService) {}

  /**
   * GET /file-manage/user-json?userId=<uid>&date=dd-MM-yyyy
   * → Trả JSON (đã parse) của 1 user trong 1 ngày
   */
  @Get('user-json')
  async getUserJson(
    @Query('userId') userId: string,
    @Query('date') date: string,
  ) {
    if (!userId || !date)
      throw new BadRequestException('userId and date are required');
    return this.files.readUserJsonByDate({ userId, date });
  }

  /**
   * GET /file-manage/user-json-range?userId=<uid>&from=dd-MM-yyyy&to=dd-MM-yyyy&includeData=false
   * → Trả danh sách file có tồn tại trong khoảng ngày (bỏ qua ngày không có file)
   */
  @Get('user-json-range')
  @ApiQuery({ name: 'userId', type: String, required: true })
  @ApiQuery({ name: 'from', type: String, required: true })
  @ApiQuery({ name: 'to', type: String, required: true })
  @ApiQuery({
    name: 'includeData',
    type: Boolean,
    required: false,
    example: false,
  })
  async getUserJsonRange(
    @Query('userId') userId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('includeData') includeData = 'false',
  ) {
    if (!userId || !from || !to)
      throw new BadRequestException('userId, from, to are required');
    const include = String(includeData).toLowerCase() === 'true';
    return this.files.listUserJsonByDateRange({
      userId,
      from,
      to,
      includeData: include,
    });
  }

  /**
   * GET /file-manage/download-user-json?userId=<uid>&date=dd-MM-yyyy
   * → Tải file .json thô (attachment)
   */
  @Get('download-user-json')
  async downloadUserJson(
    @Query('userId') userId: string,
    @Query('date') date: string,
    @Res() res: Response,
  ) {
    if (!userId || !date)
      throw new BadRequestException('userId and date are required');
    const out = await this.files.streamUserJsonByDate({ userId, date });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', String(out.size));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(out.filename)}"`,
    );
    out.stream.pipe(res);
  }

  @Get('user-json-range-summary')
  async createAndReturnUserJsonRangeSummary(
    @Query('userId') userId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!userId || !from || !to) {
      throw new BadRequestException('userId, from, to are required');
    }

    // 1) Build & save (trả metadata có fullPath)
    const meta = await this.files.buildAndSaveUserSummaryFromRange({
      userId,
      from,
      to,
    });

    // 2) Read content vừa lưu
    const raw = await fs.readFile(meta.fullPath, 'utf-8');

    // 3) Parse an toàn qua unknown
    let content: unknown;
    try {
      content = JSON.parse(raw) as unknown;
    } catch {
      throw new BadRequestException('Summary file is not valid JSON');
    }

    // 4) (tuỳ chọn) Normalize dd/MM/yyyy -> dd-MM-yyyy trong days[].date
    if (hasDaysArray(content)) {
      for (const d of content.days) {
        const cur = d['date'];
        if (typeof cur === 'string') {
          d['date'] = normalizeDateStr(cur);
        }
      }
    }

    return {
      success: true,
      message: 'Summary saved and loaded',
      data: { meta, content },
      timestamp: new Date().toISOString(),
    };
  }
}
