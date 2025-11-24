import { Inject, Injectable } from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';

import { PatientHabitsRepository } from '../infra/prisma/patient-habit.repo';
import { LmStudioService } from '@/modules/lm-studio/application/lmstudio.service';
import {
  HabitRecord,
  SleepCheckinRecord,
} from '../interface/dto/get-habits.dto';
import { PATIENT_HABITS_REPO } from '../domain/repositories/patient-habit.repo.interface';

@Injectable()
export class PatientHabitsService {
  constructor(
    @Inject(PATIENT_HABITS_REPO)
    private readonly repo: PatientHabitsRepository,

    private readonly llm: LmStudioService,
  ) {}

  startOfDay = (d: Date): Date => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  addDays = (d: Date, n: number): Date => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  isSameDate = (a: Date, b: Date): boolean => {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  };

  formatYMD = (d: Date): string => {
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  };

  async runDailySleepAnalysis(): Promise<void> {
    const today = this.startOfDay(new Date());
    const yesterday = this.addDays(today, -1);

    const habits: HabitRecord[] = await this.repo.getActiveSleepHabits();

    for (const habit of habits) {
      if (!habit.day_to_check) continue;

      const dayToCheck = this.startOfDay(habit.day_to_check);

      if (!this.isSameDate(dayToCheck, yesterday)) continue;

      // get checkins
      const sleepCheckin: SleepCheckinRecord | null =
        await this.repo.getSleepCheckin(habit.user_id, yesterday);

      const awakeCheckin: SleepCheckinRecord | null =
        await this.repo.getAwakeCheckin(habit.user_id, today);

      if (!sleepCheckin || !awakeCheckin) continue;

      // payload send to LLM
      const payload = {
        user_id: habit.user_id,
        date: this.formatYMD(yesterday),
        sleep_start: habit.sleep_start,
        sleep_end: habit.sleep_end,
        sleep: { at: sleepCheckin.checkin_at },
        awake: { at: awakeCheckin.checkin_at },
      };

      const llmResult = await this.llm.analyzeSleep(payload);

      // save JSON
      this.saveJson(habit.user_id, yesterday, llmResult);

      // update next day_to_check
      const nextCheck = this.addDays(dayToCheck, habit.number_day ?? 1);
      await this.repo.updateHabitDayToCheck(habit.habit_id, nextCheck);
    }
  }

  private saveJson(uid: string, date: Date, content: string): void {
    const folder = path.join(process.cwd(), `analyses/${uid}/Sleep`);
    mkdirSync(folder, { recursive: true });

    const file = path.join(folder, `${this.formatYMD(date)}.json`);
    writeFileSync(file, content, 'utf8');
  }
}
