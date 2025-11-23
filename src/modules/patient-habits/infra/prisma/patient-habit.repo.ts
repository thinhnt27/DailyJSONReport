import { Injectable } from '@nestjs/common';
import { PatientHabitRepository } from '../../domain/repositories/patient-habit.repo.interface';
import { PatientHabitEntity } from '../../domain/entities/patient-habit.entity';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PatientHabitRepoPrisma implements PatientHabitRepository {
  constructor(
    private readonly prisma: PrismaClient | Prisma.TransactionClient,
  ) {}

  async findAll(): Promise<PatientHabitEntity[]> {
    const rows = await this.prisma.patient_habits.findMany({
      orderBy: { created_at: 'desc' },
    });

    return rows.map(
      (r) =>
        new PatientHabitEntity(
          r.habit_id,
          r.habit_type,
          r.habit_name,
          r.description,
          r.frequency,
          r.days_of_week,
          r.location,
          r.notes,
          r.is_active,
          r.created_at,
          r.updated_at,
          r.supplement_id,
          r.user_id,
          r.sleep_start,
          r.sleep_end,
        ),
    );
  }
}
