import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService wrapper that exposes a typed PrismaClient instance.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      log: process.env.DB_LOGGING === 'true' ? ['query', 'error', 'warn'] : ['error'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      // Configure connection pool for pgbouncer
      datasourceUrl: process.env.DATABASE_URL,
    });
  }

  async onModuleInit() {
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  // Expose the raw client for repository use
  get client(): PrismaClient {
    return this.prisma;
  }

  /**
   * Wrapper method to execute queries with retry logic for prepared statement errors
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    let retries = 0;

    while (retries < maxRetries) {
      try {
        return await operation();
      } catch (error) {
        retries++;

        // Check if it's a prepared statement error
        const isPreparedStatementError =
          error?.message?.includes('prepared statement') ||
          error?.message?.includes('does not exist');

        if (isPreparedStatementError && retries < maxRetries) {
          // Exponential backoff: wait before retry
          await new Promise((resolve) =>
            setTimeout(resolve, 100 * retries),
          );
          continue;
        }

        // Re-throw if not a retryable error or max retries reached
        throw error;
      }
    }

    // This should never be reached, but TypeScript needs this
    throw new Error('Max retries reached');
  }
}
