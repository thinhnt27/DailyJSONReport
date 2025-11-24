import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  HabitRecord,
  CameraRecord,
} from '../../interface/dto/camera-analysis.dto';
export const PATIENT_CAMERA_REPO = 'PATIENT_CAMERA_REPO';

@Injectable()
export class PatientCameraRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getAllHabits(): Promise<HabitRecord[]> {
    const rows = await this.prisma.patient_habits.findMany({
      select: {
        habit_id: true,
        user_id: true,
      },
    });

    return rows.map((h) => ({
      habit_id: h.habit_id,
      user_id: h.user_id,
    }));
  }

  async getCamerasByUser(userId: string): Promise<CameraRecord[]> {
    const rows = await this.prisma.cameras.findMany({
      where: { user_id: userId, is_online: true },
      select: {
        camera_id: true,
        camera_name: true,
        rtsp_url: true,
      },
    });

    return rows.map((c) => ({
      camera_id: c.camera_id,
      camera_name: c.camera_name,
      rtsp_url: c.rtsp_url ?? '',
    }));
  }
}
