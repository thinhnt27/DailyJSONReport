// patient-habits.repository.ts
import { Injectable } from '@nestjs/common';
import {
  HabitRecord,
  SleepCheckinRecord,
} from '../../interface/dto/get-habits.dto';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PatientHabitsRepository {
  constructor(
    private readonly prisma: PrismaClient | Prisma.TransactionClient,
  ) {}
  startOfDay = (d: Date): Date => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  async getActiveSleepHabits(): Promise<HabitRecord[]> {
    const rows = await this.prisma.patient_habits.findMany({
      where: { is_active: true, habit_type: 'sleep' },
    });

    return rows.map((r) => ({
      habit_id: r.habit_id,
      user_id: r.user_id,
      sleep_start: r.sleep_start,
      sleep_end: r.sleep_end,
      day_to_check: r.day_to_check,
      number_day: r.number_day,
    }));
  }

  async getSleepCheckin(
    userId: string,
    date: Date,
  ): Promise<SleepCheckinRecord | null> {
    const row = await this.prisma.patient_sleep_checkins.findFirst({
      where: {
        user_id: userId,
        state: 'sleep',
        checkin_at: {
          gte: this.startOfDay(date),
          lt: new Date(this.startOfDay(date).getTime() + 24 * 3600 * 1000),
        },
      },
    });

    if (!row) return null;

    return {
      id: row.id,
      user_id: row.user_id,
      state: row.state,
      checkin_at: row.checkin_at,
      habit_id: row.habit_id,
    };
  }

  async getAwakeCheckin(
    userId: string,
    date: Date,
  ): Promise<SleepCheckinRecord | null> {
    const row = await this.prisma.patient_sleep_checkins.findFirst({
      where: {
        user_id: userId,
        state: 'awake',
        checkin_at: {
          gte: this.startOfDay(date),
          lt: new Date(this.startOfDay(date).getTime() + 24 * 3600 * 1000),
        },
      },
    });

    if (!row) return null;

    return {
      id: row.id,
      user_id: row.user_id,
      state: row.state,
      checkin_at: row.checkin_at,
      habit_id: row.habit_id,
    };
  }

  updateHabitDayToCheck(habitId: string, newDate: Date) {
    return this.prisma.patient_habits.update({
      where: { habit_id: habitId },
      data: { day_to_check: newDate },
    });
  }
}
