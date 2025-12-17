import { Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient, suggestions } from '@prisma/client';
import type { ISuggestionRepo } from '../../domain/repositories/suggestion.repo.interface';

@Injectable()
export class PrismaSuggestionRepo implements ISuggestionRepo {
  constructor(
    private readonly prisma: PrismaClient | Prisma.TransactionClient,
  ) {}

  async findByUserId(
    userId: string,
    category?: string,
  ): Promise<suggestions[]> {
    const now = new Date();
    return this.prisma.suggestions.findMany({
      where: {
        user_id: userId,
        status: 'ACTIVE',
        ...(category && { type: category }),
        OR: [{ skip_until: null }, { skip_until: { lt: now } }],
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findById(suggestionId: string): Promise<suggestions | null> {
    return await this.prisma.suggestions.findUnique({
      where: { suggestion_id: suggestionId },
    });
  }

  async findByType(
    userId: string,
    type: string,
  ): Promise<suggestions | null> {
    return await this.prisma.suggestions.findFirst({
      where: {
        user_id: userId,
        type,
        status: 'ACTIVE',
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async create(data: {
    user_id: string;
    type: string;
    title: string;
    message?: string;
    meta?: any;
    resource_type?: string;
    resource_id?: string;
  }): Promise<suggestions> {
    return await this.prisma.suggestions.create({
      data: {
        ...data,
        status: 'ACTIVE',
        meta: data.meta ? JSON.stringify(data.meta) : undefined,
      },
    });
  }

  async update(
    suggestionId: string,
    data: Partial<{
      status: string;
      skip_until: Date;
      skip_reason: string;
      updated_at: Date;
    }>,
  ): Promise<suggestions> {
    return await this.prisma.suggestions.update({
      where: { suggestion_id: suggestionId },
      data: {
        ...(data.status && { status: data.status as any }),
        ...(data.skip_until !== undefined && { skip_until: data.skip_until }),
        ...(data.skip_reason !== undefined && { skip_reason: data.skip_reason }),
        updated_at: new Date(),
      },
    });
  }

  async skip(suggestionId: string): Promise<suggestions> {
    const skipUntil = new Date();
    skipUntil.setDate(skipUntil.getDate() + 30); // Skip for 30 days

    return this.prisma.suggestions.update({
      where: { suggestion_id: suggestionId },
      data: {
        updated_at: new Date(),
        skip_until: skipUntil,
      },
    });
  }

  async unskip(suggestionId: string): Promise<suggestions> {
    return this.prisma.suggestions.update({
      where: { suggestion_id: suggestionId },
      data: {
        updated_at: new Date(),
        skip_until: null,
      },
    });
  }

  async resolve(suggestionId: string): Promise<suggestions> {
    return await this.prisma.suggestions.update({
      where: { suggestion_id: suggestionId },
      data: {
        status: 'RESOLVED',
        updated_at: new Date(),
      },
    });
  }

  async deleteById(suggestionId: string): Promise<void> {
    await this.prisma.suggestions.delete({
      where: { suggestion_id: suggestionId },
    });
  }

  async findActiveSuggestionsByType(
    type: string,
  ): Promise<suggestions[]> {
    return await this.prisma.suggestions.findMany({
      where: {
        type,
        status: 'ACTIVE',
        OR: [
          { skip_until: null },
          { skip_until: { lt: new Date() } },
        ],
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async upsertSuggestion(data: {
    user_id: string;
    type: string;
    title: string;
    message?: string;
    meta?: any;
    resource_type?: string;
    resource_id?: string;
  }): Promise<suggestions> {
    // Find existing by user + type + title (title contains camera name)
    const existing = await this.prisma.suggestions.findFirst({
      where: {
        user_id: data.user_id,
        type: data.type,
        title: data.title,
        status: 'ACTIVE',
      },
    });

    console.log('[DEBUG] Upsert:', {
      title: data.title,
      found: !!existing,
      existingId: existing?.suggestion_id,
      hasBullets: !!data.meta?.bullets,
      bulletsCount: data.meta?.bullets?.length,
    });

    if (existing) {
      // Update existing
      const updated = await this.prisma.suggestions.update({
        where: { suggestion_id: existing.suggestion_id },
        data: {
          title: data.title,
          message: data.message,
          meta: data.meta ? JSON.stringify(data.meta) : undefined,
          updated_at: new Date(),
        },
      });
      console.log('[DEBUG] Updated meta:', typeof updated.meta, updated.meta);
      return updated;
    } else {
      // Create new
      console.log('[DEBUG] Creating new suggestion with bullets:', data.meta?.bullets);
      return await this.create(data);
    }
  }
}
