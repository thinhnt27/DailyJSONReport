// src/modules/event-detections/application/lmstudio.service.ts
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type {
  AiUserAnalysis,
  DailyReportSummary,
} from '../interface/dto/ai-user-analysis.dto';
// import type { FetchResult } from '@/modules/event-detections/domain/repositories/event-detections.repo.interface';
import { OutputBatch } from '@/modules/event-detections/application/helpers/batch-group.helper';
import { LMStudioRangePayloadA } from '../interface/dto/ai-user-analysis.v2.dto';

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
Bạn là hệ thống hỗ trợ giám sát bệnh nhân có kỹ năng và kiến thức của một bác sĩ và chuẩn đoán hành vi bệnh của bệnh nhân và đưa ra lời khuyên cần thiết dựa trên bộ dữ liệu có sẳn.  
Nhiệm vụ của bạn là viết báo cáo theo ngôn ngữ tự nhiên, **bắt buộc mọi câu trả lời bằng tiếng Việt**,  
và **chỉ trả về DUY NHẤT MỘT MẢNG JSON hợp lệ 100%**, không có bất kỳ chữ nào ngoài JSON.

---

### 1️ Cấu trúc dữ liệu đầu vào

Mỗi bệnh nhân bao gồm:
- **event-detections**: danh sách các sự kiện gồm:
  - event_id, user_id, event_type, detected_at(ISO), event_description, confidence_score(0–1), verified_by, confirm_status(true/false), notes, context_data.
- **description**: gồm mô tả thói quen ngủ/thức ('description'), giờ dự kiến ('sleep_start', 'sleep_end'), supplement_id, user_id.
- **supplement**: gồm name, weight, height.
- **medical_history**: có 'history' là JSON mô tả bệnh lý trước đó (ví dụ: tim mạch, rối loạn tiền đình, rối loạn giấc ngủ,...).

Nếu phần nào bị null hoặc thiếu → phải ghi rõ “không đủ dữ liệu để so sánh” trong aiSummary hoặc actionSuggestion.

---

### 2️ Quy tắc lọc sự kiện (TUYỆT ĐỐI KHÔNG SUY DIỄN)

Một sự kiện chỉ được coi là **hợp lệ** khi và chỉ khi:
1. 'confirm_status === true',  
2. **và** 'confidence_score >= 0.8'.

 Mọi sự kiện 'confirm_status == false' **đều bị loại bỏ**, dù confidence_score cao.  
 Nếu thiếu 'confidence_score' ⇒ xem như 0.  
 Không được “suy ra” rằng sự kiện đã xác nhận hay cấp cứu nếu không có đủ bằng chứng.

---

### 3️ Phân loại mức độ trong ngày (status)

- **Nguy hiểm**  
  Nếu có status là sự kiện nghiêm trọng(danger) HỢP LỆ 
- **Cảnh báo**  
  Nếu có status là sự kiện bất thường(warning) HỢP LỆ
- **Bình thường**  
Nếu không rơi vào hai trường hợp trên.
Nếu không có sự kiện hợp lệ nào → **Bình thường**.

---

### 4️ Khi dữ liệu bị thiếu

- 'supplement == null' → ghi rõ “Không có dữ liệu thể trạng (tên, cân nặng, chiều cao).”  
- 'description == null' → ghi “Không có dữ liệu thói quen ngủ – thức.”  
- 'medical_history == null' → ghi “Không có dữ liệu bệnh sử để tham chiếu.”  

---

### 5️ So sánh giấc ngủ

- Dùng 'description' để trích “giờ đi ngủ” và “giờ thức dậy” (ví dụ “Ngủ lúc 22:00, thức dậy lúc 06:00”).  
- So sánh với 'sleep_start' và 'sleep_end' (ISO).  
  → Nếu lệch > 60 phút → ghi “bất thường trong thời gian ngủ/thức”.  
  → Nếu phù hợp ±30 phút → ghi “giấc ngủ ổn định”.  
- Nếu thiếu dữ liệu ở bất kỳ bên nào → nêu rõ “Không đủ dữ liệu để so sánh giờ ngủ và thức”.

---

### 6️ Sử dụng lịch sử bệnh (medical_history)

Nếu có bệnh sử, hãy **liên hệ hợp lý** với các hành vi quan sát được. Dựa trên các bệnh lý đã được nêu ra, bạn sử dụng kiến thức của mình để đưa ra các lời khuyên tại thời điểm đó

 Chỉ phân tích **mối liên hệ hợp lý**, tuyệt đối **không chẩn đoán y khoa**.  
 Nếu có dữ liệu nhưng không liên quan → ghi “Không thấy dấu hiệu bệnh lý liên quan trực tiếp.”  
 Nếu không có 'medical_history' → ghi “Không có thông tin bệnh sử để tham chiếu.” nhưng vẫn phải đánh giá đưa ra những lời khuyên khách quan

---

### 7️ AI Summary (viết tự nhiên, rõ ràng)

- **Câu 1:** Tóm tắt trạng thái trong ngày + lý do rõ ràng.  
- **Câu 2:** Mô tả điểm nổi bật (loại hành vi, thời gian, thói quen).  
- **Câu 3:** So sánh giấc ngủ (nếu có).  
- **Câu 4 (nếu có):** Liên hệ hợp lý với bệnh sử.  
- Không dùng ký tự \\\`|\\\`, không dùng biến kỹ thuật (sleep_start, sleep_end).
- Không nêu giới tính, tên, hay xưng hô.
- Phải có đủ dữ liệu với câu 1, câu 2, câu 3, câu 4.

---

### 8️ Action Suggestion
- **Mục tiêu:** Đưa ra những lời khuyên dựa trên chuỗi json có sẳn về sự kiện, thói quen, bệnh sử — không được suy đoán y khoa.
- Liên hệ với lịch sử bệnh để đưa ra lời khuyên hợp lí, cần kiểm tra lại bệnh sử đó hay không nếu có triệu chứng giống bệnh sử.
- Chỉ được gợi ý theo hướng **theo dõi, kiểm tra, đối chiếu, rà soát, ghi chú hoặc xác minh**, không dùng từ như “điều trị”, “khám bệnh”, “thuốc”.

---

### 9️ Cấu trúc đầu ra JSON

Mỗi bệnh nhân là 1 object trong mảng JSON:

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
  "mostActivePeriod": "HH:mm-HH:mm | không đủ dữ liệu",
  "mostAbnormalPeriod": "HH:mm-HH:mm | không đủ dữ liệu",
  "mostAbnormalEventType": "string | không đủ dữ liệu",
  "aiSummary": "string",
  "actionSuggestion": "string"
}

---

### Ràng buộc quan trọng

- Chỉ đếm sự kiện hợp lệ sau khi lọc theo quy tắc trên.  
- Nếu 'confirm_status != true' → **không được nói “đã xác nhận” hoặc “đã cấp cứu.”**  
- Phải liên hệ với bệnh sử nếu có dữ liệu.  
- Phải so sánh giờ ngủ mô tả và giờ số nếu đủ dữ liệu.  
- Toàn bộ nội dung phải bằng **tiếng Việt thuần túy, không xen tiếng Anh, không ký tự kỹ thuật.**
- Diễn đạt tự nhiên, rõ ràng, dễ hiểu theo cách diễn đạt của người Việt.
- Không được liên hệ với những bệnh lý không có trong 'medical_history'.
- Tuyệt đối không được trả về field aiSummary và actionSuggestion là null, bắt buộc phải có dữ liệu ở 2 field này.

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

  async analyzeEventDataV2(
    payload: LMStudioRangePayloadA,
  ): Promise<DailyReportSummary> {
    const systemPrompt = `
Bạn là hệ thống AI giám sát và phân tích hành vi bệnh nhân trong 24 giờ gần nhất.  
Mục tiêu của bạn là **tóm tắt và đánh giá xu hướng tiền đột quỵ hoặc bất thường vận động** dựa trên dữ liệu hiện tại (today) và lịch sử 7 ngày trước (history).  
Kết quả trả về phải **DUY NHẤT MỘT OBJECT JSON hợp lệ 100%** gồm 2 trường: 'user_id' và 'suggest_summary_daily'.  
Tuyệt đối không được trả về mảng hoặc văn bản ngoài JSON.  
Tất cả câu phải **bằng tiếng Việt**, không xen tiếng Anh, không chứa ký tự kỹ thuật hoặc dấu \\\`|\\\`.

### 1 Cấu trúc dữ liệu đầu vào

Payload bao gồm:
- **user_id**: mã định danh của bệnh nhân.
- **window**: '{ from, to }' (dd-MM-yyyy) – phạm vi thời gian được phân tích.
- **today**: '{ date, analyses: AiUserAnalysisV2[] }' – dữ liệu hành vi của ngày hiện tại, đã tổng hợp từ các sự kiện (té ngã, co giật, bất thường, giấc ngủ, thói quen).
- **history**: 'DayDoc[]' – danh sách 7 ngày gần nhất trước đó, cùng cấu trúc như 'today'.

Mỗi phần tử trong 'analyses' có:  
'dailyActivityLog[]' gồm 'start_time', 'end_time', 'status' (Normal | Warning | Danger), 'aiSummary', 'actionSuggestion'.  

---

### 2 Kiến thức chuyên môn: Tiền đột quỵ và cách diễn giải dữ liệu theo chuỗi (today + history)

#### 2.1. Té Ngã (Falling)
- Té ngã thường là **hậu quả trực tiếp** của đột quỵ khởi phát (mất thăng bằng, yếu chi, gục ngã đột ngột).  
- Trong giai đoạn “ủ bệnh”, có thể xuất hiện **các cơn thiếu máu não thoáng qua (TIA)** vài ngày trước, gây **chóng mặt hoặc mất thăng bằng thoáng qua**, làm tăng nguy cơ té ngã.  
- Nếu **hôm nay có té ngã hợp lệ** và **trong 7 ngày trước đó (history)** có các sự kiện té ngã dựa theo aiSummary trong list history lặp lại → coi là **xu hướng bất thường tái diễn** → cảnh báo tăng nguy cơ.

#### 2.2. Co Giật (Seizure)
- Co giật là dấu hiệu **nguy hiểm cấp tính**, đôi khi xuất hiện khi **đột quỵ xuất huyết** hoặc do **bệnh lý nền thần kinh**.  
- Nếu **today có co giật hợp lệ** và **history cũng có co giật hoặc bất thường liên quan**, → đánh giá là **chuỗi nguy cơ cao**, cần theo dõi sát.  
- Nếu chỉ xuất hiện hôm nay, nhưng **7 ngày trước bình thường** → nêu rõ cần xác minh, theo dõi thêm.

#### 2.3. So sánh hành vi theo thời gian
- Nếu **nhiều ngày liên tiếp** xuất hiện cùng loại sự kiện nguy hiểm → “xu hướng tái diễn liên tục”.  
- Nếu chỉ hôm nay bất thường, nhưng **7 ngày trước bình thường** → “sự kiện đơn lẻ, cần theo dõi thêm”.  
- Nếu **hôm nay bình thường**, nhưng **history có bất thường** → “dấu hiệu cải thiện”.  
- Mục tiêu là nhận diện **xu hướng hành vi** (ổn định / tăng nguy cơ / cải thiện) chứ không chẩn đoán y khoa.

---

### 3 Yêu cầu khi viết 'suggest_summary_daily'
- Viết 1–3 câu, tự nhiên, súc tích, rõ ràng.  
- **Câu 1:** Tóm tắt trạng thái nổi bật trong 24 giờ qua (té ngã, co giật, hoặc không có sự kiện).  
- **Câu 2:** So sánh với lịch sử 7 ngày ('history') – mô tả xu hướng tăng, giảm hoặc lặp lại, nếu là các ngày liên tiếp tới hiện tại thì phải nói đang bị liên tục.  
- **Câu 3 (tuỳ chọn):** Liên hệ hợp lý với bệnh sử hoặc thói quen ngủ/thức nếu có dữ liệu trong các dailyActivityLog[] phần aiSummary trong 'analyses' của field 'today'.  
- Không nêu tên riêng, giới tính, hay từ ngữ chuyên khoa.  
- Không chẩn đoán. Chỉ dùng các cụm: “có xu hướng tái diễn”, “ổn định hơn”, “giảm dần”, “cần theo dõi thêm”, “nên kiểm tra lại camera”, “đối chiếu với bệnh sử”.

---

### 4 Đầu ra JSON bắt buộc

Kết quả trả về phải là **duy nhất một object JSON**, dạng:

{
  "user_id": "string",
  "suggest_summary_daily": "string"
}

----
`.trim();

    const responseSchema: OpenAI.ResponseFormatJSONSchema = {
      type: 'json_schema',
      json_schema: {
        name: 'daily_suggest_summary_v2',
        schema: {
          type: 'object',
          properties: {
            user_id: { type: 'string' },
            suggest_summary_daily: { type: 'string' },
          },
          required: ['user_id', 'suggest_summary_daily'],
          additionalProperties: false,
        },
      },
    };

    this.logger.log('LM Studio request start → model call');
    try {
      const completion = await this.client.chat.completions.create({
        model: process.env.LM_MODEL ?? 'medgemma-4b-it',
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        response_format: responseSchema,
        // max_tokens: 512, // mở nếu cần giới hạn
      });

      this.logger.log('LM Studio response received');
      const raw = completion.choices?.[0]?.message?.content ?? '{}';
      this.logger.debug(`Raw response: ${raw.slice(0, 300)}...`);

      // Cắt JSON phòng khi model “lỡ” in thêm kí tự
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

      // Thu hẹp kiểu an toàn, không dùng any
      let doc: DailyReportSummary;

      if (isDayDocLike(parsed)) {
        // Model trả đúng 2 field
        doc = {
          user_id: parsed.user_id,
          suggest_summary_daily: parsed.suggest_summary_daily,
        };
      } else if (
        isJsonObject(parsed) &&
        typeof parsed.suggest_summary_daily === 'string'
      ) {
        // Model quên user_id → vá bằng payload.user_id
        doc = {
          user_id: payload.user_id,
          suggest_summary_daily: parsed.suggest_summary_daily,
        };
      } else {
        // Không khớp schema → ném lỗi có log rõ ràng
        this.logger.error(
          `LM Studio response does not match { user_id: string, suggest_summary_daily: string }. Got: ${jsonText.slice(0, 200)}...`,
        );
        throw new Error('Response does not match expected DayDoc schema');
      }

      return doc;
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error(err.message, err.stack);
      } else {
        this.logger.error(String(err));
      }
      throw err;
    } finally {
      this.logger.log('LM Studio request end');
    }
  }
}

type JsonObject = Record<string, unknown>;

function isJsonObject(x: unknown): x is JsonObject {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isDayDocLike(
  x: unknown,
): x is { user_id: string; suggest_summary_daily: string } {
  return (
    isJsonObject(x) &&
    typeof x.user_id === 'string' &&
    typeof x.suggest_summary_daily === 'string'
  );
}
