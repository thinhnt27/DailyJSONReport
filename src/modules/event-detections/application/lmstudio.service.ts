// src/modules/event-detections/application/lmstudio.service.ts
import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import type { FetchResult } from '../domain/repositories/event-detections.repo.interface';
import { AiUserAnalysis } from '../interface/dto/ai-user-analysis.dto';

@Injectable()
export class LmStudioService {
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      baseURL: process.env.LM_API_BASE ?? 'http://127.0.0.1:1234/v1',
      apiKey: process.env.LM_API_KEY ?? 'lm-studio', // bắt buộc có key, dù dummy
    });
  }

  async analyzeEventData(payload: FetchResult): Promise<AiUserAnalysis[]> {
    const systemPrompt = `
Bạn là hệ thống AI phân tích hành vi bệnh nhân, chỉ báo cáo dữ liệu.
Trả về DUY NHẤT mảng JSON đúng format.
    `.trim();

    const completion = await this.client.chat.completions.create({
      model: process.env.LM_MODEL ?? 'medgemma-4b-it',
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0].message?.content ?? '[]';
    const result = JSON.parse(raw) as AiUserAnalysis[];
    return result;
  }
}
