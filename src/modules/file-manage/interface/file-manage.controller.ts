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
}
