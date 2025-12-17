import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { CameraTestService } from '../application/camera-test.service';

@Controller('camera-test')
export class CameraTestController {
  constructor(private readonly service: CameraTestService) {}

  @Get('capture-file')
  async captureFile(@Query('rtsp') rtsp: string, @Res() res: Response) {
    const imageBase64 = await this.service.captureFrame(rtsp);

    if (!imageBase64) {
      res.status(500).json({
        success: false,
        message: 'Failed to capture frame',
      });
      return;
    }

    const buff = Buffer.from(imageBase64, 'base64');

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', 'inline; filename="frame.jpg"');

    return res.send(buff);
  }

  @Post('analyze')
  analyze(@Body('base64') base64: string) {
    return this.service.analyzeBrightness(base64);
  }

  @Get('capture-and-analyze')
  async captureAndAnalyze(@Query('rtsp') rtsp: string) {
    const base64 = await this.service.captureFrame(rtsp);
    if (!base64) return { success: false, message: 'Cannot capture frame' };

    const analyze = this.service.analyzeBrightness(base64);
    return { success: true, imageBase64: base64, ...analyze };
  }
}
