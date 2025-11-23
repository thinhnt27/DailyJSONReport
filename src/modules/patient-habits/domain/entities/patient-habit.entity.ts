export class PatientHabitEntity {
  constructor(
    public habit_id: string,
    public habit_type: string,
    public habit_name: string,
    public description: string | null,
    public frequency: string,
    public days_of_week: any | null,
    public location: string | null,
    public notes: string | null,
    public is_active: boolean,
    public created_at: Date,
    public updated_at: Date,
    public supplement_id: string | null,
    public user_id: string,
    public sleep_start: Date | null,
    public sleep_end: Date | null,
  ) {}
}
