import * as fs from 'fs';
import * as path from 'path';
import type {
  FetchResult,
  IEventDetectionsRepo,
} from './repositories/event-detections.repo.interface';

/**
 * Options for fetchEventsAndPatientHabits
 */
export interface FetchEventsOptions {
  limit?: number;
  page?: number;
  eventFields?: string[];
  habitFields?: string[];
  saveToFile?: boolean;
  filename?: string;
  fetchAll?: boolean; // If true, ignore date range and fetch ALL records
}

/**
 * Logger shape used by the function. Defaults to console if not provided.
 */
export interface SimpleLogger {
  log: (msg: string) => void;
  error: (msg: string, err?: unknown) => void;
}

/**
 * Fetch event_detections from 12:00 (noon) previous day to 12:00 (noon)
 * of given endDate (or today) in Asia/Ho_Chi_Minh timezone and return
 * unique user_ids' patient_habits. The function delegates DB work to the
 * provided repository and optionally writes the full raw result to disk.
 */
export async function fetchEventsAndPatientHabits(
  repo: IEventDetectionsRepo,
  endDateIso?: string,
  options?: FetchEventsOptions,
  logger: SimpleLogger = console,
): Promise<FetchResult> {
  // If fetchAll is true, fetch ALL records without date filtering
  let startNoon: Date | undefined;
  let endNoon: Date | undefined;

  if (!options?.fetchAll) {
    // Asia/Ho_Chi_Minh is fixed at +07:00 (no DST). We avoid external tz libs
    // by shifting the reference time into the TZ, setting noon, then shifting
    // back to UTC to produce Date objects that represent the desired instants.
    const TZ_OFFSET_HOURS = 7;

    const baseDate = endDateIso ? new Date(endDateIso) : new Date();

    // shift into TZ space
    const shifted = new Date(baseDate.getTime() + TZ_OFFSET_HOURS * 3600_000);
    // set to 12:00 in TZ (use UTC methods because we've shifted the instant)
    shifted.setUTCHours(12, 0, 0, 0);
    // shift back to real UTC instant representing 12:00 in TZ
    endNoon = new Date(shifted.getTime() - TZ_OFFSET_HOURS * 3600_000);
    startNoon = new Date(endNoon.getTime() - 24 * 3600_000);
  }

  // If no limit specified, fetch ALL records in the time window
  const limit = options?.limit;
  const page = options?.page && options.page > 0 ? options.page : 1;
  const offset = limit ? (page - 1) * limit : 0;

  const eventFieldsParam =
    options?.eventFields && options.eventFields.length > 0
      ? options.eventFields
      : undefined;
  const habitFieldsParam =
    options?.habitFields && options.habitFields.length > 0
      ? options.habitFields
      : undefined;

  // Delegate DB-heavy work to repository
  const result = await repo.fetchEventsAndPatientHabits({
    start: startNoon,
    end: endNoon,
    limit,
    offset,
    page,
    eventFields: eventFieldsParam,
    habitFields: habitFieldsParam,
  });

  // Make a copy to return to client. We may strip internal identifiers
  // (user_id / habit_id) from the response if the client explicitly
  // requested a custom field list that omits them.
  const returnResult: FetchResult = JSON.parse(
    JSON.stringify(result),
  ) as FetchResult;

  // If client provided eventFields but did NOT include 'user_id', strip it
  if (
    eventFieldsParam &&
    Array.isArray(eventFieldsParam) &&
    !eventFieldsParam.includes('user_id')
  ) {
    const events = returnResult['event-detections'];
    if (Array.isArray(events)) {
      for (const e of events) {
        if (e && typeof e === 'object' && 'user_id' in e) {
          delete e.user_id;
        }
      }
    }
  }

  // If client provided habitFields but did NOT include 'habit_id', strip it
  if (
    habitFieldsParam &&
    Array.isArray(habitFieldsParam) &&
    !habitFieldsParam.includes('habit_id')
  ) {
    const habits = returnResult['patient-habits'];
    if (Array.isArray(habits)) {
      for (const h of habits) {
        if (h && typeof h === 'object' && 'habit_id' in h) {
          delete h.habit_id;
        }
      }
    }
  }

  // Persist full result to disk if requested (keep full data for debugging/audit)
  if (options?.saveToFile) {
    try {
      const dataDir = path.resolve(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
      const fname =
        options.filename ||
        `events_and_habits_${new Date().toISOString().slice(0, 10)}.json`;
      const full = path.join(dataDir, fname);
      fs.writeFileSync(full, JSON.stringify(result, null, 2), 'utf8');
      logger.log(`Saved event & habit data to ${full}`);
    } catch (err) {
      logger.error('Failed to save file', err);
    }
  }

  return returnResult;
}

export async function fetchLatestEventsAndPatientHabits(
  repo: IEventDetectionsRepo,
): Promise<FetchResult> {
  const result = await repo.fetchLatestEventsAndPatientHabits();

  // deep copy để có thể strip field giống hàm kia
  const returnResult: FetchResult = JSON.parse(
    JSON.stringify(result),
  ) as FetchResult;

  return returnResult;
}

export async function fetchEventsAndHabitsByRange(
  repo: IEventDetectionsRepo,
  from: Date | string, // ví dụ '2025-10-13 08:00:00+07:00' hoặc Date
  to: Date | string, // ví dụ '2025-10-14 23:59:59+07:00' hoặc Date
): Promise<FetchResult> {
  const result = await repo.fetchEventsAndHabitsByRange(from, to);

  // deep copy để có thể strip field giống hàm kia
  const returnResult: FetchResult = JSON.parse(
    JSON.stringify(result),
  ) as FetchResult;

  return returnResult;
}
