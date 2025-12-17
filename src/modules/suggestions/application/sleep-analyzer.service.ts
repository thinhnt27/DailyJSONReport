// Service for analyzing sleep patterns and generating sleep quality suggestions
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface SleepAnalysisInput {
  userId: string;
  checkins: SleepCheckin[];
  days: number;
}

export interface SleepCheckin {
  state: string;
  checkin_at: Date;
  meta?: any;
}

export interface SleepAnalysisResult {
  bullets: string[];
  generatedByAI: boolean;
  stats: {
    totalCheckins: number;
    avgSleepTime: string | null;
    avgWakeTime: string | null;
    irregularDays: number;
    lateNightCount: number;
  };
}

@Injectable()
export class SleepAnalyzerService {
  private readonly logger = new Logger(SleepAnalyzerService.name);
  private readonly cozeClient: AxiosInstance;
  private readonly botId: string | undefined;

  private readonly FALLBACK_BULLETS = [
    'Duy trì giờ ngủ cố định mỗi ngày để tạo nhịp sinh học ổn định',
    'Tránh sử dụng điện thoại hoặc xem TV trước khi ngủ 30 phút',
    'Đảm bảo phòng ngủ yên tĩnh, tối và mát mẻ để ngủ sâu hơn',
  ];

  constructor() {
    const cozeApiBase = process.env.COZE_API_BASE ?? 'https://api.coze.com';
    const cozeToken = process.env.COZE_API_TOKEN;
    this.botId = process.env.COZE_BOT_ID;

    this.cozeClient = axios.create({
      baseURL: cozeApiBase,
      headers: {
        'Authorization': `Bearer ${cozeToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });
  }

  /**
   * Analyze sleep patterns and generate improvement suggestions
   */
  async analyzeSleepQuality(input: SleepAnalysisInput): Promise<SleepAnalysisResult> {
    try {
      const stats = this.calculateSleepStats(input.checkins);
      
      this.logger.log(
        `Sleep stats for user ${input.userId}: ${stats.totalCheckins} checkins, ` +
        `${stats.irregularDays} irregular days, ${stats.lateNightCount} late nights`,
      );

      // Try to generate AI suggestions
      const bullets = await this.generateAISuggestions(input, stats);

      if (bullets) {
        return { bullets, generatedByAI: true, stats };
      }

      // Fallback
      return {
        bullets: this.FALLBACK_BULLETS,
        generatedByAI: false,
        stats,
      };

    } catch (error) {
      this.logger.error(`Sleep analysis failed: ${error.message}`);
      return {
        bullets: this.FALLBACK_BULLETS,
        generatedByAI: false,
        stats: {
          totalCheckins: 0,
          avgSleepTime: null,
          avgWakeTime: null,
          irregularDays: 0,
          lateNightCount: 0,
        },
      };
    }
  }

  private calculateSleepStats(checkins: SleepCheckin[]) {
    const sleepTimes: Date[] = [];
    const wakeTimes: Date[] = [];
    let lateNightCount = 0;
    let irregularDays = 0;

    // Group by date and analyze patterns
    const byDate = new Map<string, SleepCheckin[]>();
    
    for (const checkin of checkins) {
      const date = new Date(checkin.checkin_at).toISOString().split('T')[0];
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(checkin);

      const hour = new Date(checkin.checkin_at).getHours();
      
      // Detect sleep time (state contains 'sleep' or 'ngủ')
      if (checkin.state.toLowerCase().includes('sleep') || 
          checkin.state.toLowerCase().includes('ngủ')) {
        sleepTimes.push(new Date(checkin.checkin_at));
        
        // Late night = sleeping after 11 PM
        if (hour >= 23 || hour < 4) {
          lateNightCount++;
        }
      }
      
      // Detect wake time (state contains 'wake' or 'thức')
      if (checkin.state.toLowerCase().includes('wake') || 
          checkin.state.toLowerCase().includes('thức') ||
          checkin.state.toLowerCase().includes('dậy')) {
        wakeTimes.push(new Date(checkin.checkin_at));
      }
    }

    // Calculate average times
    const avgSleepTime = this.calculateAverageTime(sleepTimes);
    const avgWakeTime = this.calculateAverageTime(wakeTimes);

    // Count irregular days (sleeping too late or too early compared to average)
    if (avgSleepTime && sleepTimes.length > 0) {
      const avgHour = parseInt(avgSleepTime.split(':')[0]);
      for (const t of sleepTimes) {
        const hour = t.getHours();
        if (Math.abs(hour - avgHour) > 2) {
          irregularDays++;
        }
      }
    }

    return {
      totalCheckins: checkins.length,
      avgSleepTime,
      avgWakeTime,
      irregularDays,
      lateNightCount,
    };
  }

  private calculateAverageTime(times: Date[]): string | null {
    if (times.length === 0) return null;

    let totalMinutes = 0;
    for (const t of times) {
      let hours = t.getHours();
      // Handle midnight crossing (e.g., 23:00 and 01:00 should average to ~00:00)
      if (hours < 6) hours += 24;
      totalMinutes += hours * 60 + t.getMinutes();
    }

    const avgMinutes = totalMinutes / times.length;
    let avgHours = Math.floor(avgMinutes / 60);
    if (avgHours >= 24) avgHours -= 24;
    const avgMins = Math.round(avgMinutes % 60);

    return `${avgHours.toString().padStart(2, '0')}:${avgMins.toString().padStart(2, '0')}`;
  }

  private async generateAISuggestions(
    input: SleepAnalysisInput,
    stats: ReturnType<typeof this.calculateSleepStats>,
  ): Promise<string[] | null> {
    if (!this.botId || !process.env.COZE_API_TOKEN) {
      return null;
    }

    try {
      const query = `Phân tích giấc ngủ người cao tuổi trong ${input.days} ngày:
- Tổng số lần check-in: ${stats.totalCheckins}
- Giờ ngủ trung bình: ${stats.avgSleepTime || 'Không xác định'}
- Giờ thức trung bình: ${stats.avgWakeTime || 'Không xác định'}  
- Số ngày ngủ không đều: ${stats.irregularDays}
- Số lần ngủ muộn (sau 23h): ${stats.lateNightCount}

Đưa ra 3 gợi ý cụ thể để cải thiện chất lượng giấc ngủ.`;

      this.logger.log(`Calling Coze for sleep analysis...`);

      const chatResponse = await this.cozeClient.post('/v3/chat', {
        bot_id: this.botId,
        user_id: 'sleep-analyzer',
        stream: false,
        auto_save_history: false,
        additional_messages: [{
          role: 'user',
          content: query,
          content_type: 'text',
        }],
      });

      const chatId = chatResponse.data?.data?.id;
      const conversationId = chatResponse.data?.data?.conversation_id;

      if (!chatId || !conversationId) {
        this.logger.warn('No chat ID returned from Coze');
        return null;
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 15000));

      // Get messages
      const messagesResponse = await this.cozeClient.get('/v3/chat/message/list', {
        params: { conversation_id: conversationId, chat_id: chatId },
      });

      const messages = messagesResponse.data?.data || [];
      const assistantMsg = messages.find(
        (m: any) => m.role === 'assistant' && m.type === 'answer',
      );

      if (!assistantMsg?.content) {
        return null;
      }

      // Parse bullets
      const bullets = assistantMsg.content
        .split('\n')
        .map((line: string) => line.replace(/^[\d\-\.\*\•]+\s*/, '').trim())
        .filter((line: string) => line.length > 10 && line.length < 200)
        .slice(0, 3);

      if (bullets.length < 3) {
        return null;
      }

      this.logger.log(`✓ Generated ${bullets.length} AI bullets for sleep analysis`);
      return bullets;

    } catch (error) {
      this.logger.error(`Coze API failed: ${error.message}`);
      return null;
    }
  }
}
