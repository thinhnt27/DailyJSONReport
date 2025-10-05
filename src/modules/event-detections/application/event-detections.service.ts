import { Inject, Injectable } from '@nestjs/common';
import type { FetchEventsOptions } from '../domain/event-detections';
import { fetchEventsAndPatientHabits } from '../domain/event-detections';
import type {
  FetchResult,
  IEventDetectionsRepo,
} from '../domain/repositories/event-detections.repo.interface';
import { EVENT_DETECTIONS_REPO } from '../domain/repositories/event-detections.repo.interface';

@Injectable()
export class EventDetectionsService {
  constructor(
    @Inject(EVENT_DETECTIONS_REPO) private readonly repo: IEventDetectionsRepo,
  ) {}

  async fetchEventsAndHabits(
    endDateIso?: string,
    options?: FetchEventsOptions,
  ): Promise<FetchResult> {
    return fetchEventsAndPatientHabits(this.repo, endDateIso, options, console);
  }
}
