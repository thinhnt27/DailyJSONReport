// src/modules/file-manage/file-read.controller.ts
import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { FileManageService } from '../application/file-manage.service';

@Controller('file-manage')
export class FileReadController {
  constructor(private readonly files: FileManageService) {}

  /**
   * GET /file-manage/first-json?date=13-10-2025&subdir=analyses
   * → Trả JSON đã parse.
   */
  @Get('first-json')
  async getFirstJson(
    @Query('date') date: string,
    @Query('subdir') subdir?: string,
  ) {
    const out = await this.files.readFirstJsonByDate({ subdir, date });
    return out; // { filename, fullPath, size, mtimeMs, data }
  }

  /**
   * GET /file-manage/download-first-json?date=13-10-2025&subdir=analyses
   * → Tải file .json thô (attachment)
   */
  @Get('download-first-json')
  async downloadFirstJson(
    @Query('date') date: string,
    @Query('subdir') subdir: string | undefined,
    @Res() res: Response,
  ) {
    const out = await this.files.streamFirstJsonByDate({ subdir, date });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', String(out.size));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(out.filename)}"`,
    );
    out.stream.pipe(res);
  }
}
