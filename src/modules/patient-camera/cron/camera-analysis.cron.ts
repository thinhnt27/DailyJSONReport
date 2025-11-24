import { Cron } from '@nestjs/schedule';
import { Injectable } from '@nestjs/common';
import { CameraAnalysisService } from '../application/camera-analysis.service';

@Injectable()
export class CameraAnalysisCron {
  constructor(private readonly service: CameraAnalysisService) {}

  @Cron('0 0 10 * * *') // 10:00:00 AM mỗi ngày
  async handleCron() {
    await this.service.runDailyCameraAnalysis();
  }
}
