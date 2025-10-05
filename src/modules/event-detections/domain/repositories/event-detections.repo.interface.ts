export interface FetchResult {
  'event-detections'?: Array<Record<string, unknown>>;
  'patient-habits'?: Array<Record<string, unknown>>;
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
}

// token to use for DI so implementations can be swapped
export const EVENT_DETECTIONS_REPO = 'EVENT_DETECTIONS_REPO';
