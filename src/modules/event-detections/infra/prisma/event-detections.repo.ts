import { BadRequestException, Injectable } from '@nestjs/common';
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
    const { start, end, limit, offset } = params;
    const prisma = this.prisma;

    // Build where clause conditionally
    const whereClause: Prisma.event_detectionsWhereInput = {};
    if (start && end) {
      whereClause.detected_at = { gte: start, lt: end };
    }

    // Select only the fields we care about from events
    const events: Array<Record<string, any>> =
      await prisma.event_detections.findMany({
        where: whereClause,
        ...(limit ? { take: limit } : {}),
        skip: offset,
        orderBy: { detected_at: 'asc' },
        select: {
          event_id: true,
          notes: true,
          user_id: true,
          event_type: true,
          event_description: true,
          confidence_score: true,
          verified_by: true,
          confirm_status: true,
          status: true,
          detected_at: true,
        },
      });

    const userIds = Array.from(
      new Set(
        events
          .map((e) => (e as Record<string, unknown>).user_id as string)
          .filter(Boolean),
      ),
    );

    // fetch habits for the users we found in events (only requested fields)
    const habits: Array<Record<string, any>> = userIds.length
      ? await prisma.patient_habits.findMany({
          where: { user_id: { in: userIds } },
          select: {
            habit_id: true,
            description: true,
            sleep_start: true,
            sleep_end: true,
            supplement_id: true,
            user_id: true,
          },
        })
      : [];

    // Fetch supplements and medical records related to the userIds so we can
    // build a consolidated patient_profile per user.
    // Collect supplement_ids from habits to limit downstream queries
    const supplementIds = Array.from(
      new Set(
        habits.map((h) => (h.supplement_id as string) || '').filter(Boolean),
      ),
    );

    const supplements: Array<Record<string, unknown>> = supplementIds.length
      ? await prisma.patient_supplements.findMany({
          where: { id: { in: supplementIds } },
          select: {
            id: true,
            name: true,
            weight_kg: true,
            height_cm: true,
            customer_id: true,
          },
        })
      : [];

    const medicalRecords: Array<Record<string, unknown>> = supplementIds.length
      ? await prisma.patient_medical_records.findMany({
          where: { supplement_id: { in: supplementIds } },
          select: { id: true, supplement_id: true, history: true },
        })
      : [];

    // Build patient profile grouped by user_id (customer_id in supplements)
    const profileByUser = new Map<string, Record<string, unknown>>();

    for (const h of habits) {
      const userId = h.user_id as string;
      if (!userId) continue;
      if (!profileByUser.has(userId))
        profileByUser.set(userId, { user_id: userId });
      const p = profileByUser.get(userId)!;
      if (!p['patient_habits']) p['patient_habits'] = [];
      (p['patient_habits'] as Array<Record<string, unknown>>).push(h);
    }

    for (const s of supplements) {
      const userId = s.customer_id as string;
      if (!userId) continue;
      if (!profileByUser.has(userId))
        profileByUser.set(userId, { user_id: userId });
      const p = profileByUser.get(userId)!;
      if (!p['patient_supplements']) p['patient_supplements'] = [];
      (p['patient_supplements'] as Array<Record<string, unknown>>).push(
        s as Record<string, unknown>,
      );
    }

    for (const mr of medicalRecords) {
      // medicalRecords point to supplement_id; find supplement to map to user
      const suppId = mr.supplement_id as string;
      const supp = supplements.find((x) => x.id === suppId);
      const userId = supp?.customer_id as string | undefined;
      if (!userId) continue;
      if (!profileByUser.has(userId))
        profileByUser.set(userId, { user_id: userId });
      const p = profileByUser.get(userId)!;
      if (!p['patient_medical_records']) p['patient_medical_records'] = [];
      (p['patient_medical_records'] as Array<Record<string, unknown>>).push(mr);
    }

    // Map events to only requested fields
    const mappedEvents = events.map((e) => ({
      event_id: e.event_id,
      notes: e.notes,
      user_id: e.user_id,
      event_type: e.event_type,
      event_description: e.event_description,
      confidence_score: e.confidence_score,
      verified_by: e.verified_by,
      confirm_status: e.confirm_status,
      status: e.status,
      detected_at: e.detected_at,
    }));

    // Build supplement map keyed by user_id so we return data for all users
    const supplementByUser: Record<string, Record<string, unknown>> = {};

    for (const h of habits) {
      const userId = h.user_id as string;
      if (!userId) continue;

      // Only set once per user (take the first habit record per user).
      if (supplementByUser[userId]) continue;

      const supId = h.supplement_id as string | undefined;
      const sup = supplements.find((s) => (s.id as string) === supId);
      const med = medicalRecords.filter(
        (mr) => (mr.supplement_id as string) === supId,
      );

      supplementByUser[userId] = {
        description: h.description,
        sleep_start: h.sleep_start,
        sleep_end: h.sleep_end,
        supplement_id: supId,
        user_id: userId,
        supplement_name: sup?.name,
        weight_kg: sup?.weight_kg,
        height_cm: sup?.height_cm,
        medical_history: med.map((m) => m.history),
      };
    }

    const result: FetchResult = {
      'event-detections': mappedEvents,
      supplement: supplementByUser,
    };

    return result;
  }

  // ... trong PrismaEventDetectionsRepo
  async fetchLatestEventsAndPatientHabits(): Promise<FetchResult> {
    // fetch latest events (limited)
    const events: Array<Record<string, unknown>> =
      await this.prisma.event_detections.findMany({
        orderBy: { detected_at: 'desc' },
        take: 100,
        select: {
          event_id: true,
          notes: true,
          user_id: true,
          event_type: true,
          event_description: true,
          confidence_score: true,
          verified_by: true,
          confirm_status: true,
          status: true,
          detected_at: true,
        },
      });

    const userIds = Array.from(
      new Set(
        events
          .map((e) => (e as { user_id?: string }).user_id)
          .filter(Boolean) as string[],
      ),
    );

    const habits: Array<Record<string, unknown>> = userIds.length
      ? await this.prisma.patient_habits.findMany({
          where: { user_id: { in: userIds } },
          select: {
            habit_id: true,
            description: true,
            sleep_start: true,
            sleep_end: true,
            supplement_id: true,
            user_id: true,
          },
        })
      : [];

    const supplementIds = Array.from(
      new Set(
        habits.map((h) => (h.supplement_id as string) || '').filter(Boolean),
      ),
    );

    const supplements: Array<Record<string, unknown>> = supplementIds.length
      ? await this.prisma.patient_supplements.findMany({
          where: { id: { in: supplementIds } },
          select: {
            id: true,
            name: true,
            weight_kg: true,
            height_cm: true,
            customer_id: true,
          },
        })
      : [];

    const medicalRecords: Array<Record<string, unknown>> = supplementIds.length
      ? await this.prisma.patient_medical_records.findMany({
          where: { supplement_id: { in: supplementIds } },
          select: { id: true, supplement_id: true, history: true },
        })
      : [];

    // Build supplement map keyed by user_id
    const supplementByUser: Record<string, Record<string, unknown>> = {};
    for (const h of habits) {
      const userId = h.user_id as string;
      if (!userId) continue;
      if (supplementByUser[userId]) continue;

      const supId = h.supplement_id as string | undefined;
      const sup = supplements.find((s) => (s.id as string) === supId);
      const med = medicalRecords.filter(
        (mr) => (mr.supplement_id as string) === supId,
      );

      supplementByUser[userId] = {
        description: h.description,
        sleep_start: h.sleep_start,
        sleep_end: h.sleep_end,
        supplement_id: supId,
        user_id: userId,
        supplement_name: sup?.name,
        weight_kg: sup?.weight_kg,
        height_cm: sup?.height_cm,
        medical_history: med.map((m) => m.history),
      };
    }

    return {
      'event-detections': events,
      'patient-habits': habits,
      patient_profile: Object.keys(supplementByUser).map((u) => ({
        user_id: u,
      })),
      supplement: supplementByUser,
    };
  }

  async fetchEventsAndHabitsByRange(
    fromRq: Date | string,
    toRq: Date | string,
  ): Promise<FetchResult> {
    const from = new Date(fromRq);
    const to = new Date(toRq);

    // Validate đầu vào
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new BadRequestException('Invalid datetime: from/to');
    }
    if (from > to) {
      throw new BadRequestException('`from` must be <= `to`');
    }

    // 1) Lấy events trong khoảng thời gian [from, to]
    const events: Array<Record<string, unknown>> =
      await this.prisma.event_detections.findMany({
        where: {
          detected_at: {
            gte: from, // >= from
            lte: to, // <= to (nếu muốn nửa mở, đổi thành lt: to)
          },
          AND: { confidence_score: { gte: 0.8 } },
        },
        orderBy: { detected_at: 'desc' },
        // bỏ take để trả full kết quả trong range (giữ lại nếu muốn giới hạn)
        select: {
          event_id: true,
          notes: true,
          user_id: true,
          event_type: true,
          event_description: true,
          confidence_score: true,
          verified_by: true,
          confirm_status: true,
          status: true,
          detected_at: true,
        },
      });

    // 2) Lấy userId liên quan
    const userIds = Array.from(
      new Set(
        events
          .map((e) => (e as { user_id?: string }).user_id)
          .filter(Boolean) as string[],
      ),
    );

    // 3) Habits theo userIds (không lọc thời gian vì bảng thói quen thường là current profile)
    const habits: Array<Record<string, unknown>> = userIds.length
      ? await this.prisma.patient_habits.findMany({
          where: { user_id: { in: userIds } },
          select: {
            habit_id: true,
            description: true,
            sleep_start: true,
            sleep_end: true,
            supplement_id: true,
            user_id: true,
          },
        })
      : [];

    // 4) Lấy supplement & medical record liên quan
    const supplementIds = Array.from(
      new Set(
        habits.map((h) => (h.supplement_id as string) || '').filter(Boolean),
      ),
    );

    const supplements: Array<Record<string, unknown>> = supplementIds.length
      ? await this.prisma.patient_supplements.findMany({
          where: { id: { in: supplementIds } },
          select: {
            id: true,
            name: true,
            weight_kg: true,
            height_cm: true,
            customer_id: true,
          },
        })
      : [];

    const medicalRecords: Array<Record<string, unknown>> = supplementIds.length
      ? await this.prisma.patient_medical_records.findMany({
          where: { supplement_id: { in: supplementIds } },
          select: { id: true, supplement_id: true, history: true },
        })
      : [];

    // 5) Build supplement map theo user_id
    const supplementByUser: Record<string, Record<string, unknown>> = {};
    for (const h of habits) {
      const userId = h.user_id as string;
      if (!userId) continue;
      if (supplementByUser[userId]) continue;

      const supId = h.supplement_id as string | undefined;
      const sup = supplements.find((s) => (s.id as string) === supId);
      const med = medicalRecords.filter(
        (mr) => (mr.supplement_id as string) === supId,
      );

      supplementByUser[userId] = {
        description: h.description,
        sleep_start: h.sleep_start,
        sleep_end: h.sleep_end,
        supplement_id: supId,
        user_id: userId,
        supplement_name: sup?.name,
        weight_kg: sup?.weight_kg,
        height_cm: sup?.height_cm,
        medical_history: med.map((m) => m.history),
      };
    }

    return {
      'event-detections': events,
      'patient-habits': habits,
      patient_profile: Object.keys(supplementByUser).map((u) => ({
        user_id: u,
      })),
      supplement: supplementByUser,
    };
  }
}
