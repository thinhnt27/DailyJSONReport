export interface AiUserAnalysis {
  user_id: string;
  habit_type: string;
  habit_name: string;
  description: string;
  dailyActivityLog: {
    start_time: string; // ISO
    end_time: string; // ISO
    status: 'Normal' | 'Warning' | 'Danger';
  };
  mostActivePeriod: string; // "HH:mm-HH:mm"
  mostAbnormalPeriod: string; // "HH:mm-HH:mm"
  mostAbnormalEventType: string;
  aiSummary: string;
  actionSuggestion: string;
}
