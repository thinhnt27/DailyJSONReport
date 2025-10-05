import { Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  FetchResult,
  IEventDetectionsRepo,
} from '../../domain/repositories/event-detections.repo.interface';

@Injectable()
export class PrismaEventDetectionsRepo implements IEventDetectionsRepo {
  // Accept a PrismaClient or a TransactionClient directly.
  constructor(
    private readonly prisma: PrismaClient | Prisma.TransactionClient,
  ) {}

  async fetchEventsAndPatientHabits(params: {
    start?: Date;
    end?: Date;
    limit?: number;
    offset: number;
    page: number;
    eventFields?: string[];
    habitFields?: string[];
  }): Promise<FetchResult> {
    const { start, end, limit, offset, eventFields, habitFields } = params;
    const prisma = this.prisma;

    // Build where clause conditionally
    const whereClause: Prisma.event_detectionsWhereInput = {};
    if (start && end) {
      whereClause.detected_at = { gte: start, lt: end };
    }

    const events: Array<Record<string, any>> =
      await prisma.event_detections.findMany({
        where: whereClause,
        ...(limit ? { take: limit } : {}),
        skip: offset,
        orderBy: { detected_at: 'asc' },
        select: eventFields
          ? Object.fromEntries(eventFields.map((f: string) => [f, true]))
          : undefined,
      });

    const userIds = Array.from(
      new Set(
        events
          .map((e) => (e as Record<string, unknown>).user_id as string)
          .filter(Boolean),
      ),
    );

    const habits: Array<Record<string, any>> =
      await prisma.patient_habits.findMany({
        where: { user_id: { in: userIds } },
        select: habitFields
          ? Object.fromEntries(habitFields.map((f: string) => [f, true]))
          : undefined,
      });

    const result: FetchResult = {
      'event-detections': events,
      'patient-habits': habits,
    };

    return result;
  }
}
