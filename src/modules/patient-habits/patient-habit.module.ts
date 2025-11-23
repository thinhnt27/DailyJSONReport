import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PatientHabitService } from './application/patient-habit.service';
import { PatientHabitController } from './interface/patient-habit.controller';
import { PatientHabitRepository } from './domain/repositories/patient-habit.repo.interface';
import { PatientHabitRepoPrisma } from './infra/prisma/patient-habit.repo';

@Module({
  controllers: [PatientHabitController],
  providers: [
    {
      provide: PatientHabitRepository,
      useFactory: (prisma: PrismaService) =>
        new PatientHabitRepoPrisma(prisma.client),
      inject: [PrismaService],
    },
    PatientHabitService,
  ],
  exports: [PatientHabitService, PatientHabitRepository],
})
export class PatientHabitModule {}
