import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PatientHabitsService } from './patient-habit.service';

@Injectable()
export class PatientHabitsCron {
  constructor(private readonly service: PatientHabitsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleCron() {
    await this.service.runDailySleepAnalysis();
  }
}
