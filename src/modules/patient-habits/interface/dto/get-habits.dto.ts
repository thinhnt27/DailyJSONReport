export interface HabitRecord {
  habit_id: string;
  user_id: string;
  sleep_start: Date | null;
  sleep_end: Date | null;
  day_to_check: Date | null;
  number_day: number | null;
}

export interface SleepCheckinRecord {
  id: string;
  user_id: string;
  state: string; // “sleep”, “awake”
  checkin_at: Date;
  habit_id: string | null;
}
