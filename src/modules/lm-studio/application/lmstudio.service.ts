// src/modules/event-detections/application/lmstudio.service.ts
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { AiUserAnalysis } from '../interface/dto/ai-user-analysis.dto';
import { FetchResult } from '@/modules/event-detections/domain/repositories/event-detections.repo.interface';

@Injectable()
export class LmStudioService {
  private readonly logger = new Logger(LmStudioService.name);
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      baseURL: process.env.LM_API_BASE ?? 'http://127.0.0.1:1234/v1',
      apiKey: process.env.LM_API_KEY ?? 'lm-studio',
    });
  }

  async analyzeEventData(payload: FetchResult): Promise<AiUserAnalysis> {
    const systemPrompt = `
Bạn là một hệ thống AI phân tích hành vi bệnh nhân, chỉ báo cáo dữ liệu (không đưa lời khuyên điều trị).

### Yêu cầu:
- Phân tích dữ liệu từ event_detections và patient_habits trong khung 12:00 hôm trước → 12:00 hôm nay.
- Nhóm theo user_id, xác định status (Normal | Warning | Danger) theo confidence_score / verified_by.
- Tìm: mostActivePeriod, mostAbnormalPeriod, mostAbnormalEventType.
- Viết tóm tắt ngắn (aiSummary, actionSuggestion) bằng tiếng Việt.
- **Chỉ trả về DUY NHẤT MỘT OBJECT JSON hợp lệ 100%**, không kèm text ngoài JSON, không có mảng [].

### Cấu trúc OBJECT bắt buộc:
{
  "user_id": "string",
  "habit_type": "string",
  "habit_name": "string",
  "description": "string",
  "dailyActivityLog": {
    "start_time": "YYYY-MM-DDTHH:mm:ssZ",
    "end_time": "YYYY-MM-DDTHH:mm:ssZ",
    "status": "Normal | Warning | Danger"
  },
  "mostActivePeriod": "HH:mm-HH:mm",
  "mostAbnormalPeriod": "HH:mm-HH:mm",
  "mostAbnormalEventType": "string",
  "aiSummary": "string",
  "actionSuggestion": "string"
}
`.trim();

    // JSON Schema cho 1 OBJECT (không phải array)
    const responseSchema: OpenAI.ResponseFormatJSONSchema = {
      type: 'json_schema',
      json_schema: {
        name: 'ai_user_analysis_single',
        schema: {
          type: 'object',
          properties: {
            user_id: { type: 'string' },
            habit_type: { type: 'string' },
            habit_name: { type: 'string' },
            description: { type: 'string' },
            dailyActivityLog: {
              type: 'object',
              properties: {
                start_time: { type: 'string' },
                end_time: { type: 'string' },
                status: {
                  type: 'string',
                  enum: ['Normal', 'Warning', 'Danger'],
                },
              },
              required: ['start_time', 'end_time', 'status'],
            },
            mostActivePeriod: { type: 'string' },
            mostAbnormalPeriod: { type: 'string' },
            mostAbnormalEventType: { type: 'string' },
            aiSummary: { type: 'string' },
            actionSuggestion: { type: 'string' },
          },
          required: [
            'user_id',
            'dailyActivityLog',
            'aiSummary',
            'actionSuggestion',
          ],
        },
      },
    };

    this.logger.log('LM Studio request start → model call');
    try {
      const completion = await this.client.chat.completions.create({
        model: process.env.LM_MODEL ?? 'medgemma-4b-it',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        response_format: responseSchema,
      });

      this.logger.log('LM Studio response received');
      const raw = completion.choices?.[0]?.message?.content ?? '{}';
      this.logger.debug(`Raw response: ${raw.slice(0, 300)}...`);

      // Sanitizer: nếu model lỡ in text ngoài JSON, cắt theo dấu { ... }
      const first = raw.indexOf('{');
      const last = raw.lastIndexOf('}');
      const jsonText =
        first >= 0 && last > first ? raw.slice(first, last + 1) : raw;

      try {
        const parsed = JSON.parse(jsonText) as
          | AiUserAnalysis
          | AiUserAnalysis[];
        // Nếu lỡ trả mảng, lấy phần tử đầu (fallback “an toàn”)
        if (Array.isArray(parsed)) {
          return parsed[0];
        }
        return parsed;
      } catch (err) {
        this.logger.error('LM Studio JSON parse failed:', err);
        throw new Error('Invalid JSON returned by LM Studio model');
      }
    } catch (err: any) {
      if (err?.code === 'model_not_found') {
        this.logger.error(
          `Model "${process.env.LM_MODEL}" chưa được load. Vui lòng bật model trong LM Studio.`,
        );
      } else {
        this.logger.error('LM Studio API error:', err?.message ?? err);
      }
      throw err;
    } finally {
      this.logger.log('LM Studio request end');
    }
  }
}
