import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { PrismaService } from '@/infra/prisma/prisma.service';
import {
  PATIENT_CAMERA_REPO,
  PatientCameraRepository,
} from './infra/prisma/patient-camera.repository';

import { CameraAnalysisService } from './application/camera-analysis.service';
import { CameraTestService } from './application/camera-test.service';
import { CameraTestController } from './interface/camera-test.controller';

@Module({
  imports: [HttpModule], // nếu service dùng HttpService
  controllers: [CameraTestController],
  providers: [
    PrismaService,

    {
      provide: PATIENT_CAMERA_REPO,
      useFactory: (prisma: PrismaService) =>
        new PatientCameraRepository(prisma.client),
      inject: [PrismaService],
    },

    CameraAnalysisService,
    CameraTestService,
  ],
  exports: [PATIENT_CAMERA_REPO, CameraAnalysisService, CameraTestService],
})
export class PatientCameraModule {}
