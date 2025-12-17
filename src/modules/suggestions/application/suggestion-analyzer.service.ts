// Service for analyzing events and creating suggestions
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface FallRiskAnalysisInput {
  cameraName: string;
  locationInRoom: string | null;
  eventCount: number;
  events: Array<{
    event_id: string;
    status: string;
    detected_at: Date;
    event_description: string | null;
  }>;
}

export interface FallRiskAnalysisResult {
  bullets: string[];
  generatedByAI: boolean;
}

@Injectable()
export class SuggestionAnalyzerService {
  private readonly logger = new Logger(SuggestionAnalyzerService.name);
  private readonly cozeClient: AxiosInstance;
  private readonly botId: string | undefined;

  // Fallback hardcoded bullets for stroke patients
  private readonly FALLBACK_BULLETS = [
    'Lắp tay vịn 2 bên hành lang hoặc cầu thang',
    'Dán băng chống trượt ở bậc tam cấp và sàn nhà',
    'Tăng cường ánh sáng bằng đèn LED tự động',
  ];

  constructor() {
    // Coze API configuration
    const cozeApiBase = process.env.COZE_API_BASE ?? 'https://api.coze.com';
    const cozeToken = process.env.COZE_API_TOKEN;
    this.botId = process.env.COZE_BOT_ID;

    if (!cozeToken || !this.botId) {
      this.logger.warn('COZE_API_TOKEN or COZE_BOT_ID not configured, will use fallback only');
    }

    this.cozeClient = axios.create({
      baseURL: cozeApiBase,
      headers: {
        'Authorization': `Bearer ${cozeToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 90000,
    });
  }

  /**
   * Generate 3 bullet recommendations for fall risk using LLM
   * Falls back to hardcoded bullets if LLM fails
   */
  async analyzeFallRisk(
    input: FallRiskAnalysisInput,
  ): Promise<FallRiskAnalysisResult> {
    try {
      const location = input.locationInRoom || input.cameraName;

      // Extract unique event descriptions
      const descriptions = input.events
        .map(e => e.event_description)
        .filter((d, i, arr) => d && arr.indexOf(d) === i)
        .slice(0, 3);
      const descriptionText = descriptions.length > 0 
        ? `\nChi tiết: ${descriptions.join('; ')}` 
        : '';

      const riskLevel = input.eventCount >= 30 ? 'rất cao' : 
                        input.eventCount >= 15 ? 'cao' : 
                        'trung bình';
      
      // Build query for Coze bot (short and focused)
      const query = `Khu vực: ${location}
Tần suất ngã: ${input.eventCount} lần trong 7 ngày (mức độ: ${riskLevel})${descriptionText}

Đề xuất 3 giải pháp an toàn cho bệnh nhân sau đột quỵ.`;

      // Call Coze Chat API (non-streaming)
      this.logger.log(`Calling Coze Bot for ${input.cameraName}...`);
      
      const chatResponse = await this.cozeClient.post('/v3/chat', {
        bot_id: this.botId,
        user_id: 'system-analyzer',
        stream: false,
        auto_save_history: true,
        additional_messages: [{
          role: 'user',
          content: query,
          content_type: 'text'
        }]
      });
      
      const chatId = chatResponse.data?.data?.id;
      const conversationId = chatResponse.data?.data?.conversation_id;
      
      if (!chatId || !conversationId) {
        this.logger.warn('Coze API did not return chat_id/conversation_id');
        return { bullets: this.FALLBACK_BULLETS, generatedByAI: false };
      }

      // Wait for bot to process
      await new Promise(resolve => setTimeout(resolve, 15000));

      // Retrieve messages
      const msgResponse = await this.cozeClient.get('/v3/chat/message/list', {
        params: { conversation_id: conversationId, chat_id: chatId }
      });

      const messages = msgResponse.data?.data || [];
      const assistantMessage = messages.find(
        (msg: any) => msg.role === 'assistant' && msg.type === 'answer'
      );
      
      const responseText = assistantMessage?.content?.trim();
      
      this.logger.debug(`RAW COZE RESPONSE:\n${responseText}`);

      if (!responseText) {
        this.logger.warn('Coze returned empty response, using fallback');
        return { bullets: this.FALLBACK_BULLETS, generatedByAI: false };
      }

      // Parse bullets from response
      let bullets = responseText
        .split('\n')
        .map((line) => line.trim())
        .map((line) => line.replace(/^[\d]+[.)\-]\s*/, '').replace(/^[•\-✓]\s*/, '').trim())
        .filter((line) => line.length > 10)
        .slice(0, 3);
      
      this.logger.debug(`PARSED BULLETS: ${JSON.stringify(bullets)}`);

      if (bullets.length < 3) {
        this.logger.warn(`Coze returned ${bullets.length} bullets, expected 3. Using fallback`);
        return { bullets: this.FALLBACK_BULLETS, generatedByAI: false };
      }

      this.logger.log(`✓ Generated ${bullets.length} Coze bullets for ${input.cameraName}`);
      return { bullets, generatedByAI: true };

    } catch (error) {
      this.logger.error(`Coze API failed: ${error.message}`, error.stack);
      return { bullets: this.FALLBACK_BULLETS, generatedByAI: false };
    }
  }
}
