import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FetchEventsOptions } from '../domain/event-detections';
import {
  fetchEventsAndPatientHabits,
  fetchLatestEventsAndPatientHabits,
} from '../domain/event-detections';
import type {
  FetchResult,
  IEventDetectionsRepo,
} from '../domain/repositories/event-detections.repo.interface';
import { EVENT_DETECTIONS_REPO } from '../domain/repositories/event-detections.repo.interface';

@Injectable()
export class EventDetectionsService {
  private readonly logger = new Logger(EventDetectionsService.name);
  constructor(
    @Inject(EVENT_DETECTIONS_REPO) private readonly repo: IEventDetectionsRepo,
  ) {}

  // Raw DB
  async fetchEventsAndHabits(
    endDateIso?: string,
    options?: FetchEventsOptions,
  ): Promise<FetchResult> {
    return fetchEventsAndPatientHabits(
      this.repo,
      endDateIso,
      options,
      this.logger,
    );
  }

  // Parameters intentionally unused here because we always analyze latest data.

  async fetchEventsAndAnalyze(): Promise<Array<Record<string, unknown>>> {
    const raw = await fetchLatestEventsAndPatientHabits(this.repo);

    const events =
      (raw['event-detections'] as Array<Record<string, unknown>>) ?? [];
    const supplementMap =
      (raw.supplement as Record<string, Record<string, unknown>>) ?? {};

    const userIds = Array.from(
      new Set(
        events
          .map((e) => e.user_id as string | undefined)
          .filter((u): u is string => typeof u === 'string' && u.length > 0),
      ),
    );

    const users = userIds.map((uid) => ({
      user_id: uid,
      'event-detections': events.filter((e) => (e.user_id as string) === uid),
      supplement: supplementMap[uid] ?? null,
    }));

    return users;
  }
}
