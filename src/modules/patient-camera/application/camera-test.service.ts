import { Injectable, Logger } from '@nestjs/common';
import * as ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as jpeg from 'jpeg-js';

@Injectable()
export class CameraTestService {
  private readonly logger = new Logger(CameraTestService.name);

  async captureFrame(rtsp: string): Promise<string | null> {
    const output = path.join(process.cwd(), 'tmp_frame.jpg');

    this.logger.log('📸 Bắt đầu capture: ' + rtsp);

    return new Promise((resolve) => {
      ffmpeg()
        .addInput(rtsp)
        .addInputOption('-rtsp_transport', 'tcp')
        .addOutputOption('-vframes', '1')
        .addOutputOption('-q:v', '2')
        .addOutputOption('-update', '1')
        .save(output)
        .on('end', () => {
          this.logger.log('✅ FFmpeg done');
          const fs = require('fs');
          if (!fs.existsSync(output)) return resolve(null);
          const base64 = fs.readFileSync(output).toString('base64');
          resolve(base64);
        })
        .on('error', (err) => {
          this.logger.error('❌ FFmpeg ERROR: ' + err.message);
          resolve(null);
        });

      // timeout
      setTimeout(() => {
        this.logger.error('⏳ TIMEOUT 5s');
        resolve(null);
      }, 5000);
    });
  }

  analyzeBrightness(base64: string) {
    const buffer = Buffer.from(base64, 'base64');
    const { data, width, height } = jpeg.decode(buffer, { useTArray: true });

    let total = 0;
    const count = width * height;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      total += lum;
    }

    const brightness = Math.round((total / count / 255) * 100);

    let level = 'normal';
    let suggestion = 'Ánh sáng ổn.';

    if (brightness < 30) {
      level = 'dark';
      suggestion = 'Phòng quá tối → cần bật thêm đèn.';
    } else if (brightness < 60) {
      level = 'dim';
      suggestion = 'Ánh sáng hơi yếu → nên tăng nguồn sáng.';
    } else if (brightness > 85) {
      level = 'bright';
      suggestion = 'Quá sáng → nên giảm bớt ánh sáng.';
    }

    return { brightness, level, suggestion };
  }
}
