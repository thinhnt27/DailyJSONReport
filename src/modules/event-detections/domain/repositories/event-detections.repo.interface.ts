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

  /**
   * Find fall events grouped by camera for a user in last N days
   * @param userId - User ID to query
   * @param days - Number of days to look back (default 7)
   * @returns Array of camera-grouped fall events with counts
   */
  findFallEventsByUserGroupedByCamera(
    userId: string,
    days?: number,
  ): Promise<
    Array<{
      camera_id: string;
      camera_name: string;
      location_in_room: string | null;
      events: Array<{
        event_id: string;
        event_type: string;
        status: string;
        detected_at: Date;
        confidence_score: number | null;
        event_description: string | null;
      }>;
      event_count: number;
    }>
  >;
}

// token to use for DI so implementations can be swapped
export const EVENT_DETECTIONS_REPO = 'EVENT_DETECTIONS_REPO';
