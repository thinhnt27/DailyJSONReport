import type { IEventDetectionsRepo } from '@/modules/event-detections/domain/repositories/event-detections.repo.interface';
import type { Prisma } from '@prisma/client';

export interface UowContext {
  // repo bound to current transaction
  eventDetectionsRepo: IEventDetectionsRepo;
  tx?: Prisma.TransactionClient;
}

export interface IUnitOfWork {
  withTransaction<T>(work: (ctx: UowContext) => Promise<T>): Promise<T>;
}

// DI token to register UnitOfWork implementation
export const IUNIT_OF_WORK = 'IUnitOfWork';
