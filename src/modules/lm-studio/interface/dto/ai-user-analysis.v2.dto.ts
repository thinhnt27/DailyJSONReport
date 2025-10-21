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
  suggest_summary_daily?: string;
}

export type DayDoc = {
  user_id: string; // dd-MM-yyyy cho date
  date: string;
  analyses: AiUserAnalysisV2[];
};

export type LMStudioRangePayloadA = {
  user_id: string;
  window: { from: string; to: string }; // dd-MM-yyyy
  today: DayDoc; // hôm nay
  history: DailySummary[]; // 7 ngày trước
};

export interface DailySummary {
  date: string; // dd-MM-yyyy
  suggest_summary_daily: string;
}
