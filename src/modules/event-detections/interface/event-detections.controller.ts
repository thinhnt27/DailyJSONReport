import { Controller, Get, Post, Query } from '@nestjs/common';
import { EventDetectionsService } from '../application/event-detections.service';
import type { FetchResult } from '../domain/repositories/event-detections.repo.interface';
import { FetchEventsQueryDto } from './dto/fetch-events.dto';
import { AiUserAnalysis } from '../../lm-studio/interface/dto/ai-user-analysis.dto';

@Controller('event-detections')
export class EventDetectionsController {
  constructor(private readonly service: EventDetectionsService) {}

  @Get()
  fetchEventsAndHabits(
    @Query() query: FetchEventsQueryDto,
  ): Promise<FetchResult> {
    // Convert string query params to proper types
    const limit = query.limit ? Number(query.limit) : undefined;
    const page = query.page ? Number(query.page) : undefined;
    const fetchAll =
      query.fetchAll === true ||
      (query.fetchAll as unknown as string) === 'true';

    return this.service.fetchEventsAndHabits(query.endDate, {
      limit,
      page,
      eventFields: query.eventFields,
      habitFields: query.habitFields,
      saveToFile: query.saveToFile,
      filename: query.filename,
      fetchAll,
    });
  }

  @Get('analyze')
  async analyze(
    @Query() query: FetchEventsQueryDto,
  ): Promise<AiUserAnalysis[]> {
    const limit = query.limit ? Number(query.limit) : undefined;
    const page = query.page ? Number(query.page) : undefined;
    const fetchAll =
      query.fetchAll === true ||
      (query.fetchAll as unknown as string) === 'true';

    return await this.service.fetchEventsAndAnalyze(query.endDate, {
      limit,
      page,
      eventFields: query.eventFields,
      habitFields: query.habitFields,
      saveToFile: query.saveToFile,
      filename: query.filename,
      fetchAll,
    });
  }

  @Get('health')
  health(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('trigger')
  async triggerNow(): Promise<unknown> {
    // Trigger the fetch immediately for testing purposes
    return this.service.fetchEventsAndHabits();
  }
}
