import { Test, TestingModule } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import { PrismaRepoFactory } from './repo-factory.prisma';
import { PrismaUnitOfWork } from './prisma-unit-of-work';
import { PrismaService } from './prisma.service';

type TransactionCallback<T> = (tx: Prisma.TransactionClient) => Promise<T>;

describe('PrismaUnitOfWork', () => {
  let unitOfWork: PrismaUnitOfWork;

  const mockPrismaClient = {
    $transaction: jest.fn<Promise<unknown>, [TransactionCallback<unknown>]>(),
  };

  const mockPrismaService = {
    client: mockPrismaClient,
  };

  const mockRepoFactory = {
    eventDetections: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaUnitOfWork,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: PrismaRepoFactory,
          useValue: mockRepoFactory,
        },
      ],
    }).compile();

    unitOfWork = module.get<PrismaUnitOfWork>(PrismaUnitOfWork);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(unitOfWork).toBeDefined();
  });

  it('should execute work within a transaction', async () => {
    const mockWork = jest.fn().mockResolvedValue('result');
    mockPrismaClient.$transaction.mockImplementation(
      async <T>(callback: TransactionCallback<T>): Promise<T> => {
        return callback(
          mockPrismaClient as unknown as Prisma.TransactionClient,
        );
      },
    );

    const result = await unitOfWork.withTransaction(mockWork);

    expect(mockPrismaClient.$transaction).toHaveBeenCalled();
    expect(mockWork).toHaveBeenCalled();
    expect(result).toBe('result');
  });

  it('should propagate errors from work function', async () => {
    const error = new Error('Test error');
    const mockWork = jest.fn().mockRejectedValue(error);
    mockPrismaClient.$transaction.mockImplementation(
      async <T>(callback: TransactionCallback<T>): Promise<T> => {
        return callback(
          mockPrismaClient as unknown as Prisma.TransactionClient,
        );
      },
    );

    await expect(unitOfWork.withTransaction(mockWork)).rejects.toThrow(
      'Test error',
    );
  });
});
