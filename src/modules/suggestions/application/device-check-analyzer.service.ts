// Service for analyzing camera quality and generating device check suggestions
import { Injectable, Logger } from '@nestjs/common';
import { CameraTestService } from '@/modules/patient-camera/application/camera-test.service';

export interface DeviceCheckAnalysisInput {
  userId: string;
  cameraId: string;
  cameraName: string;
  rtspUrl: string;
  locationInRoom: string | null;
}

export interface DeviceCheckAnalysisResult {
  brightness: number;
  qualityLevel: 'poor' | 'fair' | 'good' | 'excellent';
  confidenceImpact: string;
  bullets: string[];
}

@Injectable()
export class DeviceCheckAnalyzerService {
  private readonly logger = new Logger(DeviceCheckAnalyzerService.name);

  // Bullets dựa trên mức độ sáng - không cần AI
  private readonly QUALITY_BULLETS = {
    poor: [
      'Thêm đèn LED hoặc mở cửa sổ để tăng ánh sáng tự nhiên',
      'Lau sạch ống kính camera để cải thiện độ rõ nét',
      'Điều chỉnh góc camera tránh ngược sáng từ cửa sổ',
    ],
    fair: [
      'Bổ sung thêm nguồn sáng phụ để đạt độ chính xác tối ưu',
      'Kiểm tra vị trí camera có bị che khuất không',
      'Cân bằng ánh sáng trong phòng để giảm vùng tối',
    ],
    good: [
      'Duy trì độ sáng hiện tại cho chất lượng nhận diện tốt',
      'Vệ sinh ống kính camera định kỳ mỗi tuần',
      'Kiểm tra kết nối mạng để đảm bảo truyền hình ổn định',
    ],
    excellent: [
      'Điều kiện ánh sáng lý tưởng, tiếp tục duy trì',
      'Vệ sinh ống kính camera định kỳ để giữ chất lượng',
      'Kiểm tra góc camera đảm bảo bao quát toàn bộ khu vực',
    ],
  };

  constructor(private readonly cameraTestService: CameraTestService) {}

  /**
   * Analyze camera quality and generate improvement suggestions
   * Dựa trên brightness → quality level → bullets tương ứng
   */
  async analyzeDeviceCheck(
    input: DeviceCheckAnalysisInput,
  ): Promise<DeviceCheckAnalysisResult> {
    try {
      this.logger.log(`Analyzing camera: ${input.cameraName}`);

      // Capture frame using ffmpeg
      const base64 = await this.cameraTestService.captureFrame(input.rtspUrl);
      
      if (!base64) {
        this.logger.warn(`Failed to capture frame from ${input.cameraName}`);
        return this.createResult(0, 'poor');
      }

      // Analyze brightness
      const analysis = this.cameraTestService.analyzeBrightness(base64);
      const brightness = analysis.brightness;
      const qualityLevel = this.getQualityLevel(brightness);

      this.logger.log(
        `✓ ${input.cameraName}: brightness=${brightness}%, quality=${qualityLevel}`,
      );

      return this.createResult(brightness, qualityLevel);

    } catch (error) {
      this.logger.error(`Device check failed for ${input.cameraName}: ${error.message}`);
      return this.createResult(0, 'poor');
    }
  }

  private getQualityLevel(brightness: number): 'poor' | 'fair' | 'good' | 'excellent' {
    if (brightness < 30) return 'poor';
    if (brightness < 50) return 'fair';
    if (brightness < 70) return 'good';
    return 'excellent';
  }

  private getConfidenceImpact(brightness: number): string {
    if (brightness < 30) return 'AI confidence thấp (<60%), phát hiện kém chính xác';
    if (brightness < 50) return 'AI confidence trung bình (60-75%), có thể bỏ sót sự kiện';
    if (brightness < 70) return 'AI confidence tốt (75-90%), hoạt động ổn định';
    return 'AI confidence cao (>90%), phát hiện chính xác tối ưu';
  }

  private createResult(
    brightness: number,
    qualityLevel: 'poor' | 'fair' | 'good' | 'excellent',
  ): DeviceCheckAnalysisResult {
    return {
      brightness,
      qualityLevel,
      confidenceImpact: this.getConfidenceImpact(brightness),
      bullets: this.QUALITY_BULLETS[qualityLevel],
    };
  }
}
