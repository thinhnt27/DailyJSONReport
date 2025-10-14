export interface FetchResult {
  'event-detections'?: Array<Record<string, unknown>>;
  'patient-habits'?: Array<Record<string, unknown>>;
  patient_profile?: Array<Record<string, unknown>>;
  // supplement can be an array, a map to array, a map to object, or a single object
  supplement?:
    | Array<Record<string, unknown>>
    | Record<string, Array<Record<string, unknown>>>
    | Record<string, Record<string, unknown>>
    | Record<string, unknown>;
  [key: string]: unknown;
}

export interface IEventDetectionsRepo {
  fetchEventsAndPatientHabits(params: {
    start?: Date;
    end?: Date;
    limit?: number;
    offset: number;
    page: number;
    eventFields?: string[];
    habitFields?: string[];
  }): Promise<FetchResult>;
  fetchLatestEventsAndPatientHabits(params?: {
    limit?: number; // mặc định 100
    eventFields?: string[]; // optional select
    habitFields?: string[]; // optional select
    ascending?: boolean; // true → trả theo thời gian tăng dần
  }): Promise<FetchResult>;

  fetchEventsAndHabitsByRange(
    from: Date | string,
    to: Date | string,
  ): Promise<FetchResult>;
}

// token to use for DI so implementations can be swapped
export const EVENT_DETECTIONS_REPO = 'EVENT_DETECTIONS_REPO';
