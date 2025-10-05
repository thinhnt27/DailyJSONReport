import type { Prisma, PrismaClient } from '@prisma/client';
import type { IEventDetectionsRepo } from '../../modules/event-detections/domain/repositories/event-detections.repo.interface';
import { PrismaEventDetectionsRepo } from '../../modules/event-detections/infra/prisma/event-detections.repo';

export type PrismaTx = Prisma.TransactionClient | PrismaClient;

export class PrismaRepoFactory {
  // return a repo instance bound to the provided tx or client
  eventDetections(ttx: PrismaTx): IEventDetectionsRepo {
    // Construct the repo with the provided transaction/client so that the
    // repository uses the same transactional context.
    return new PrismaEventDetectionsRepo(ttx);
  }
}
