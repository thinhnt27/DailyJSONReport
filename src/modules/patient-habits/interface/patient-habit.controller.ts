import { Controller, Get } from '@nestjs/common';
import { PatientHabitService } from '../application/patient-habit.service';

@Controller('patient-habits')
export class PatientHabitController {
  constructor(private readonly service: PatientHabitService) {}

  @Get()
  async getAll() {
    return this.service.getAll();
  }
}
