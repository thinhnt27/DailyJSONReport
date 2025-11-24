import { PatientHabitEntity } from '../entities/patient-habit.entity';

export interface PatientHabitRepository {
  findAll(): Promise<PatientHabitEntity[]>;
  getActiveSleepHabits(): Promise<PatientHabitEntity[]>;
  updateDayToCheck(habitId: string, newDate: Date): Promise<void>;
}

export const PATIENT_HABITS_REPO = Symbol('PATIENT_HABITS_REPO');
