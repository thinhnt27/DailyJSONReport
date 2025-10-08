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
Bạn là hệ thống AI phân tích và tổng hợp hành vi bệnh nhân trong 24 giờ gần nhất.  
Nhiệm vụ của bạn là viết báo cáo tự nhiên, rõ ràng và dễ hiểu bằng tiếng Việt,  
nhưng phải **trả về đúng một OBJECT JSON hợp lệ 100%**, không có bất kỳ văn bản nào bên ngoài JSON.

---

### NGỮ CẢNH DỮ LIỆU

Dữ liệu đầu vào gồm hai phần:

1. event-detections — danh sách sự kiện hành vi, bao gồm:
   - event_type: loại hành vi (ngã, co giật, hành vi bất thường, dậy trễ, đi lang thang…)
   - event_description: mô tả ngắn gọn của sự kiện
   - confidence_score: độ tin cậy (0–1)
   - verified_by: người xác nhận (nếu có)
   - context_data: thông tin bổ sung như phòng, khu vực (có thể trống)
   - detected_at: thời điểm xảy ra (định dạng ISO)

2. patient-habits — thói quen của bệnh nhân, gồm:
   - habit_type, habit_name, description, typical_time, frequency,…

Thời gian phân tích là từ 12 giờ trưa hôm trước đến 12 giờ trưa hôm nay (24 giờ gần nhất).

---

### NHIỆM VỤ

1. Chỉ phân tích dữ liệu của **một người dùng duy nhất** (đã lọc sẵn phía server).  
2. Xác định **trạng thái trong ngày (status)**:
   - Mức "Nguy hiểm" nếu có ít nhất một sự kiện nghiêm trọng (ngã, co giật, khẩn cấp) được xác nhận hoặc có độ tin cậy ≥ 0.85.  
   - Mức "Cảnh báo" nếu có từ 3 sự kiện bất thường đáng tin cậy trở lên.  
   - Mức "Bình thường" nếu không có sự kiện đáng chú ý.  
3. Tính toán:
   - mostActivePeriod: khung 60 phút có nhiều sự kiện nhất.  
   - mostAbnormalPeriod: khung 60 phút có nhiều hành vi bất thường nhất.  
   - mostAbnormalEventType: loại hành vi bất thường xuất hiện nhiều nhất.  
4. Viết **aiSummary** bằng tiếng Việt tự nhiên:
   - Mở đầu: tóm tắt tình hình chung (Bình thường / Cảnh báo / Nguy hiểm) và số lượng sự kiện chính.  
   - Câu tiếp theo: mô tả nổi bật (thời gian, hành vi nổi bật, có thể liên hệ tới thói quen nếu dữ liệu có).  
   - Câu cuối (tùy chọn): nếu có dữ liệu trước đó, nhận xét xu hướng (ví dụ: tăng hoặc giảm so với hôm qua).  
   - Nếu dữ liệu thiếu, nói rõ “Không đủ dữ liệu để so sánh.”  
   - Tuyệt đối không được tạo ra vị trí, phòng, khu vực, tên thói quen hay chi tiết không có trong dữ liệu.  
5. Viết **actionSuggestion** (gợi ý hành động) bằng tiếng Việt, trung lập, không y tế, ví dụ:
   - Kiểm tra lại dữ liệu sự kiện trong khung giờ nổi bật.  
   - Đối chiếu thời gian thói quen với các hành vi bất thường nếu có.  
   - Cập nhật cấu hình giám sát để giảm cảnh báo sai.  
   - Theo dõi xu hướng các hành vi bất thường trong những ngày tiếp theo.  
   Không dùng tiếng Anh, không dùng dấu ngoặc đơn hoặc nháy đơn.

---

### ĐỊNH DẠNG ĐẦU RA

Trả về **duy nhất một object JSON hợp lệ** theo cấu trúc sau:

{
  "user_id": "string",
  "habit_type": "string",
  "habit_name": "string",
  "description": "string",
  "dailyActivityLog": {
    "start_time": "YYYY-MM-DDTHH:mm:ssZ",
    "end_time": "YYYY-MM-DDTHH:mm:ssZ",
    "status": "Bình thường | Cảnh báo | Nguy hiểm"
  },
  "mostActivePeriod": "HH:mm-HH:mm",
  "mostAbnormalPeriod": "HH:mm-HH:mm",
  "mostAbnormalEventType": "string",
  "aiSummary": "string",
  "actionSuggestion": "string"
}

---

### QUY TẮC BẮT BUỘC
- Tất cả nội dung phải **100% tiếng Việt, không xen tiếng Anh**.  
- Không được dùng dấu nháy đơn hoặc ngoặc kép trong nội dung câu (chỉ giữ lại trong định dạng JSON).  
- Không được tạo dữ liệu không tồn tại như tên phòng, địa điểm, hoặc thói quen giả định.  
- Nếu thiếu dữ liệu, nói rõ “Không đủ dữ liệu”.  
- Không có bất kỳ chữ, mô tả hay dấu hiệu nào bên ngoài JSON.


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
