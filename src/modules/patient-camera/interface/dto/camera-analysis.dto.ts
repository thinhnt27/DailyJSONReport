export interface HabitRecord {
  habit_id: string;
  user_id: string;
}

export interface CameraRecord {
  camera_id: string;
  camera_name: string;
  rtsp_url: string;
}

export interface CameraAnalysisPayload {
  user_id: string;
  camera_name: string;
  date: string;
  image_base64: string;
}

export interface CameraBrightnessPayload {
  user_id: string;
  camera_name: string;
  date: string;
  image_base64: string;
}

export interface BrightnessResult {
  brightness: number;
  recommendation: string;
}
