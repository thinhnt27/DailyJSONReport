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
    
    // Enable query retry for transient errors
    this.prisma.$use(async (params, next) => {
      const maxRetries = 3;
      let retries = 0;
      
      while (retries < maxRetries) {
        try {
          return await next(params);
        } catch (error) {
          retries++;
          
          // Retry only for specific transient errors
          const isPreparedStatementError = 
            error?.message?.includes('prepared statement') ||
            error?.message?.includes('does not exist');
            
          if (isPreparedStatementError && retries < maxRetries) {
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, 100 * retries));
            continue;
          }
          
          throw error;
        }
      }
    });
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  // Expose the raw client for repository use
  get client(): PrismaClient {
    return this.prisma;
  }
}
