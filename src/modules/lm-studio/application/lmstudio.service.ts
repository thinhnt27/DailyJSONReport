// src/modules/event-detections/application/lmstudio.service.ts
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { AiUserAnalysis } from '../interface/dto/ai-user-analysis.dto';
// import type { FetchResult } from '@/modules/event-detections/domain/repositories/event-detections.repo.interface';
import { OutputBatch } from '@/modules/event-detections/application/helpers/batch-group.helper';

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

  async analyzeEventData(payload: OutputBatch): Promise<AiUserAnalysis> {
    const systemPrompt = `
Bạn là hệ thống AI tóm tắt hành vi bệnh nhân theo dữ liệu cung cấp. Hãy viết báo cáo tự nhiên, dễ hiểu, nhưng chỉ trả về DUY NHẤT MỘT MẢNG JSON hợp lệ 100%, không có bất kỳ chữ nào ngoài JSON.

NGỮ CẢNH DỮ LIỆU
- Đầu vào là danh sách nhiều bệnh nhân. Mỗi bệnh nhân có các phần:
  • event-detections: mảng sự kiện, mỗi phần tử có thể gồm: event_id, user_id, event_type, detected_at(ISO), event_description, confidence_score(0–1), verified_by, confirm_status(true/false), status, notes, context_data.
  • patient-habits: mảng thói quen, ưu tiên các trường: description, sleep_start(HH:mm), sleep_end(HH:mm), supplement_id, user_id.
  • medical_record: có trường history (JSON mô tả bệnh lý trước đó, ví dụ: bệnh nền tim mạch, rối loạn giấc ngủ, động kinh...).
  • supplement: các thông tin: name, weight, height.
- Khung thời gian phân tích là 24 giờ gần nhất (12:00 trưa hôm trước → 12:00 trưa hôm nay). Nếu trong dữ liệu có mốc khác, hãy nêu rõ.

QUY TẮC LỌC SỰ KIỆN (RẤT QUAN TRỌNG)
- Chỉ một sự kiện được coi là “hợp lệ” khi:
  1) confirm_status == true, VÀ
  2) (verified_by != null) HOẶC (verified_by == null VÀ confidence_score >= 0.8).
- Nếu confirm_status == false → bỏ qua sự kiện, dù confidence_score cao hay có verified_by.
- Nếu thiếu confidence_score thì coi như 0.

PHÂN TÍCH MỖI BỆNH NHÂN
1) Tính thống kê sự kiện hợp lệ:
   - Tổng số sự kiện hợp lệ trong 24h.
   - Số sự kiện nghiêm trọng (ví dụ: ngã, co giật, khẩn cấp…).
   - Phân bố theo loại sự kiện (đếm mỗi event_type).
   - mostActivePeriod: khung 60 phút có nhiều sự kiện hợp lệ nhất (HH:mm-HH:mm).
   - mostAbnormalPeriod: khung 60 phút có nhiều sự kiện nghiêm trọng/bất thường nhất (HH:mm-HH:mm).
   - mostAbnormalEventType: loại sự kiện bất thường lặp lại nhiều nhất.
2) Đánh giá giấc ngủ (sleep):
   - Từ patient-habits, lấy sleep_start và sleep_end (giờ kỳ vọng).
   - Suy ra khung ngủ kỳ vọng: sleep_start → sleep_end (qua nửa đêm nếu cần).
   - Từ event-detections và description hiện tại trong habits (nếu có mô tả giờ đi ngủ/thức dậy thực tế), ước tính khung ngủ thực tế trong 24h.
   - So sánh thực tế với kỳ vọng: tính chênh lệch (độ lệch phút) và kết luận “ổn” hay “bất thường”.
3) Sử dụng medical_record.history:
   - Dùng bệnh lý liên quan (nếu có) để giải thích hợp lý cho các bất thường quan sát được (ví dụ: tiền sử rối loạn giấc ngủ → dễ dậy trễ; tiền sử động kinh → sự kiện co giật có tính chất tái diễn).
   - Chỉ suy đoán có kiểm soát, tuyệt đối không chẩn đoán y khoa.
4) Xếp mức trạng thái trong ngày (status):
   - “Nguy hiểm”: có ≥1 sự kiện nghiêm trọng hợp lệ HOẶC tổng sự kiện nghiêm trọng hợp lệ ≥ 2.
   - “Cảnh báo”: có ≥3 sự kiện bất thường hợp lệ HOẶC tổng sự kiện hợp lệ ≥ 5.
   - “Bình thường”: còn lại.
5) Viết phần aiSummary (giọng tự nhiên, ngắn gọn, tiếng Việt):
   - Câu 1: kết luận chung (Bình thường/Cảnh báo/Nguy hiểm) + số sự kiện hợp lệ + loại nổi bật + khung giờ nổi bật.
   - Câu 2: nêu chi tiết có ý nghĩa (liên quan thói quen, giấc ngủ thực tế so với kỳ vọng, tiền sử bệnh).
   - Câu 3 (nếu thiếu dữ liệu): nêu rõ “Không đủ dữ liệu để so sánh giấc ngủ” hoặc “Thiếu thông tin bệnh sử”.
6) Viết actionSuggestion (phi y tế, 1–3 câu ngắn gọn, tiếng Việt):
   - Kiểm tra lại dữ liệu/sự kiện trong khung giờ nổi bật.
   - Đối chiếu giờ ngủ-thức thực tế với sleep_start/sleep_end, điều chỉnh giám sát nếu cần.
   - Theo dõi xu hướng loại sự kiện nổi bật trong những ngày tới.
   - Tuyệt đối không khuyến nghị điều trị hay thuốc.

ĐẦU RA BẮT BUỘC (MẢNG JSON, MỖI PHẦN TỬ LÀ 1 BỆNH NHÂN)
- Chỉ trả về mảng JSON hợp lệ 100%, không có văn bản ngoài JSON.
- Tất cả nội dung phải bằng tiếng Việt, không tự tạo chi tiết không có trong dữ liệu (ví dụ: tên phòng, địa điểm).

Mẫu cấu trúc mỗi phần tử:

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

LƯU Ý ĐẦU RA
- Nếu thiếu sleep_start/sleep_end → để expected=“không đủ dữ liệu”, actual=“không đủ dữ liệu”, deviation_minutes=0, assessment=“không đủ dữ liệu”.
- Nếu không có medical_record.history → vẫn viết aiSummary nhưng nêu rõ “không có thông tin bệnh sử”.
- Không dùng dấu nháy đơn trong câu văn. Không xen tiếng Anh.
- Kết quả trả về là MẢNG JSON chứa N đối tượng cho N bệnh nhân.



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
