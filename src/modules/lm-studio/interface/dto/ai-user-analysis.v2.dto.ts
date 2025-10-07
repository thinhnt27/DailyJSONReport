export type Status = 'Normal' | 'Warning' | 'Danger';

export interface DailyLogItem {
  start_time: string;
  end_time: string;
  status: Status;
  aiSummary: string;
  actionSuggestion: string;
}

export interface AiUserAnalysisV2 {
  user_id: string;
  habit_type: string;
  habit_name: string;
  description: string;
  dailyActivityLog: DailyLogItem[];
  mostActivePeriod?: string; // "HH:mm-HH:mm"
  mostAbnormalPeriod?: string; // "HH:mm-HH:mm"
  mostAbnormalEventType?: string;
}
