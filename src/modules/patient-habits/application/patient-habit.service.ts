import { Injectable } from '@nestjs/common';
import { PatientHabitRepository } from '../domain/repositories/patient-habit.repo.interface';

@Injectable()
export class PatientHabitService {
  constructor(private readonly repo: PatientHabitRepository) {}

  async getAll() {
    return this.repo.findAll();
  }
}
