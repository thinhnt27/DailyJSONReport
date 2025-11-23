import { PatientHabitEntity } from '../entities/patient-habit.entity';

export abstract class PatientHabitRepository {
  abstract findAll(): Promise<PatientHabitEntity[]>;
}
