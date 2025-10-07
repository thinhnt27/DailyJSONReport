// src/modules/event-detections/application/lmstudio.service.ts
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { AiUserAnalysis } from '../interface/dto/ai-user-analysis.dto';
import type { FetchResult } from '@/modules/event-detections/domain/repositories/event-detections.repo.interface';

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
  "aiSummary": "string",
  "actionSuggestion": "string"
}
`.trim();

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
            // mostActivePeriod: { type: 'string' },
            // mostAbnormalPeriod: { type: 'string' },
            // mostAbnormalEventType: { type: 'string' },
            aiSummary: { type: 'string' },
            actionSuggestion: { type: 'string' },
          },
          required: [
            'user_id',
            'dailyActivityLog',
            'aiSummary',
            'actionSuggestion',
          ],
          additionalProperties: true,
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
      const raw: string = completion.choices?.[0]?.message?.content ?? '{}';
      this.logger.debug(`Raw response: ${raw.slice(0, 300)}...`);

      // Cắt chỉ phần JSON nếu model lỡ in kèm text
      const first = raw.indexOf('{');
      const last = raw.lastIndexOf('}');
      const jsonText =
        first >= 0 && last > first ? raw.slice(first, last + 1) : raw;

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`LM Studio JSON parse failed: ${msg}`);
        throw new Error('Invalid JSON returned by LM Studio model');
      }

      // // Nếu lỡ trả mảng, lấy phần tử đầu; vẫn đảm bảo return AiUserAnalysis
      // if (Array.isArray(parsed)) {
      //   const head = parsed[0] as AiUserAnalysis | undefined;
      //   if (!head) throw new Error('Empty array returned by LM Studio model');
      //   return head;
      // }
      return parsed as AiUserAnalysis;
    } catch (err: unknown) {
      // Thuần hoá logging để không “unsafe-member-access/call”
      if (err instanceof Error) {
        this.logger.error(err.message, err.stack);
      } else {
        this.logger.error(String(err));
      }
      throw err; // vẫn ném lại để service trên xử lý
    } finally {
      this.logger.log('LM Studio request end');
    }
  }
}
