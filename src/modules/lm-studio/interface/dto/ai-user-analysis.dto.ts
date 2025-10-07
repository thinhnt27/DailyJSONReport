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
