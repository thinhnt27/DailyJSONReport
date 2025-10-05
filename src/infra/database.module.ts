import { Global, Module } from '@nestjs/common';
import { IUNIT_OF_WORK } from '../application/common/uow/unit-of-work.interface';
import { PrismaUnitOfWork } from './prisma/prisma-unit-of-work';
import { PrismaService } from './prisma/prisma.service';
import { PrismaRepoFactory } from './prisma/repo-factory.prisma';

/**
 * DatabaseModule - Shared infrastructure module for database access.
 *
 * Provides:
 * - PrismaService: Singleton Prisma client wrapper
 * - PrismaRepoFactory: Factory for creating transactional repositories
 * - IUNIT_OF_WORK: Unit of Work pattern implementation
 *
 * This module is marked as @Global so it's available throughout the app
 * without needing to import it in every module.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    PrismaRepoFactory,
    {
      provide: IUNIT_OF_WORK,
      useClass: PrismaUnitOfWork,
    },
  ],
  exports: [PrismaService, PrismaRepoFactory, IUNIT_OF_WORK],
})
export class DatabaseModule {}
