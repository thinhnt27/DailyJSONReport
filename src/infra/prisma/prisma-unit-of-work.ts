import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  IUnitOfWork,
  UowContext,
} from '../../application/common/uow/unit-of-work.interface';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaRepoFactory } from './repo-factory.prisma';

@Injectable()
export class PrismaUnitOfWork implements IUnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repoFactory: PrismaRepoFactory,
  ) {}

  async withTransaction<T>(work: (ctx: UowContext) => Promise<T>): Promise<T> {
    const client = this.prisma.client;

    const result = await client.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const ctx: UowContext = {
          eventDetectionsRepo: this.repoFactory.eventDetections(tx),
          tx,
        };
        return work(ctx);
      },
    );

    return result;
  }
}
