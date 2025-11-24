import { Inject, Injectable } from '@nestjs/common';
import {
  PATIENT_CAMERA_REPO,
  PatientCameraRepository,
} from '../infra/prisma/patient-camera.repository';
import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import jpeg from 'jpeg-js';

// ---- FIX TYPE CHO RTSP-FFMPEG ----
type RtspClientOptions = { input: string; resolution?: string };

interface RtspSafeClient {
  start(): void;
  stop(): void;
  on(event: 'data', handler: (buf: Buffer) => void): void;
}

interface RtspClientModule {
  RtspClient: new (options: RtspClientOptions) => RtspSafeClient;
}

let RtspClient: new (options: RtspClientOptions) => RtspSafeClient;

async function loadRtspModule(): Promise<void> {
  const mod = (await import('rtsp-ffmpeg')) as unknown as RtspClientModule;
  RtspClient = mod.RtspClient;
}

@Injectable()
export class CameraAnalysisService {
  constructor(
    @Inject(PATIENT_CAMERA_REPO) private readonly repo: PatientCameraRepository,
  ) {
    void loadRtspModule();
  }

  async runDailyCameraAnalysis() {
    const habits = await this.repo.getAllHabits();
    const today = new Date().toISOString().slice(0, 10);

    for (const habit of habits) {
      const cameras = await this.repo.getCamerasByUser(habit.user_id);

      for (const cam of cameras) {
        if (!cam.rtsp_url) continue;

        const frame = await this.captureFrame(cam.rtsp_url);
        if (!frame) continue;

        const brightness = this.calcBrightness(frame);
        const recommendation = this.getRecommendation(brightness);

        this.saveJson(habit.user_id, today, cam.camera_name, {
          brightness,
          recommendation,
          camera: cam.camera_name,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  private saveJson(uid: string, date: string, camName: string, data: unknown) {
    const folder = path.join(process.cwd(), `analyses/${uid}/Camera/${date}`);
    mkdirSync(folder, { recursive: true });

    const file = path.join(folder, `${camName}.json`);
    writeFileSync(file, JSON.stringify(data, null, 2));
  }

  // ---- FIX: SAFE CLIENT WRAPPING ----
  private captureFrame(rtspUrl: string): Promise<Buffer | null> {
    return new Promise((resolve) => {
      const client = new RtspClient({ input: rtspUrl, resolution: '640x360' });

      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) resolve(null);
        resolved = true;
        client.stop();
      }, 3000);

      client.on('data', (data: Buffer) => {
        if (resolved) return;
        clearTimeout(timer);
        resolved = true;
        resolve(data);
        client.stop();
      });

      client.start();
    });
  }

  // ---- FIX: jpeg.decode phải dùng options object ----
  private calcBrightness(buffer: Buffer): number {
    const decoded = jpeg.decode(buffer, {
      useTArray: true,
      colorTransform: false,
    });

    const pixels = decoded.data;
    let sum = 0;
    let count = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      sum += (r + g + b) / 3;
      count++;
    }

    return Math.round((sum / (count * 255)) * 100);
  }

  private getRecommendation(b: number): string {
    if (b < 30) return 'Ánh sáng rất thấp — tăng đèn ngay.';
    if (b < 50) return 'Ánh sáng yếu — nên tăng ánh sáng.';
    if (b < 70) return 'Ánh sáng bình thường — ok.';
    if (b < 90) return 'Ánh sáng hơi mạnh — nên giảm đèn.';
    return 'Ánh sáng quá mạnh — gây chói mắt.';
  }
}
