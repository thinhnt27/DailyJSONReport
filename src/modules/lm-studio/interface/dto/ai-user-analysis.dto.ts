export interface AiUserAnalysis {
  user_id: string;
  habit_type: string;
  habit_name: string;
  description: string;
  dailyActivityLog: {
    start_time: string;
    end_time: string;
    status: 'Normal' | 'Warning' | 'Danger';
  };
  aiSummary: string;
  actionSuggestion: string;
}

export type DailyReportSummary = {
  user_id: string; // dd-MM-yyyy cho date
  suggest_summary_daily: string;
};
