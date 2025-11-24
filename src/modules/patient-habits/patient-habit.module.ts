import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { PATIENT_HABITS_REPO } from './domain/repositories/patient-habit.repo.interface';
import { PatientHabitsRepository } from './infra/prisma/patient-habit.repo';

import { PatientHabitsService } from './application/patient-habit.service';
import { PatientHabitsCron } from './application/patient-habits.cron';

import { LmStudioService } from '@/modules/lm-studio/application/lmstudio.service';
import { PrismaService } from '@/infra/prisma/prisma.service';

@Module({
  imports: [HttpModule],
  providers: [
    PrismaService,
    {
      provide: PATIENT_HABITS_REPO,
      useFactory: (prisma: PrismaService) =>
        new PatientHabitsRepository(prisma.client),
      inject: [PrismaService],
    },
    PatientHabitsService,
    PatientHabitsCron,
    LmStudioService,
  ],
  exports: [PatientHabitsService, PATIENT_HABITS_REPO],
})
export class PatientHabitsModule {}
