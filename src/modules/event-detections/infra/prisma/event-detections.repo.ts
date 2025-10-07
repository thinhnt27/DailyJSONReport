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
    console.log(`Result`, result);

    return result;
  }

  async fetchLatestEventsAndPatientHabits(params?: {
    limit?: number; // mặc định 100
    eventFields?: string[]; // select các field của event (optional)
    habitFields?: string[]; // select các field của habit (optional)
    ascending?: boolean; // nếu true, trả events theo thời gian tăng dần (mặc định false = mới -> cũ)
  }): Promise<FetchResult> {
    const limit =
      params?.limit && params.limit > 0 ? Math.min(params.limit, 1000) : 100;

    const eventSelect = params?.eventFields
      ? (Object.fromEntries(params.eventFields.map((f) => [f, true])) as Record<
          string,
          true
        >)
      : undefined;

    // Lấy mới nhất: orderBy detected_at desc, chỉ lấy record có detected_at != null
    const events: Array<Record<string, unknown>> =
      await this.prisma.event_detections.findMany({
        where: { detected_at: { not: null } },
        orderBy: [
          { detected_at: 'desc' },
          // gợi ý: thêm second key để thứ tự ổn định khi phân trang
          { id: 'desc' } as any,
        ],
        take: limit,
        select: eventSelect,
      });

    // Nếu bạn muốn trả về theo thứ tự tăng dần (cũ -> mới) cho tiện hiển thị/pipeline
    const finalEvents =
      params?.ascending === true ? [...events].reverse() : events;

    const userIds = Array.from(
      new Set(
        finalEvents
          .map((e) => (e as Record<string, unknown>).user_id as string)
          .filter(Boolean),
      ),
    );

    const habitSelect = params?.habitFields
      ? (Object.fromEntries(params.habitFields.map((f) => [f, true])) as Record<
          string,
          true
        >)
      : undefined;

    const habits: Array<Record<string, unknown>> =
      await this.prisma.patient_habits.findMany({
        where: userIds.length ? { user_id: { in: userIds } } : undefined,
        select: habitSelect,
      });

    return {
      'event-detections': finalEvents,
      'patient-habits': habits,
    };
  }
}
