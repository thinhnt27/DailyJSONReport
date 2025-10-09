import { Test, TestingModule } from '@nestjs/testing';
import { EventDetectionsService } from './event-detections.service';
import {
  EVENT_DETECTIONS_REPO,
  IEventDetectionsRepo,
} from '../domain/repositories/event-detections.repo.interface';

describe('EventDetectionsService', () => {
  let service: EventDetectionsService;
  let repository: IEventDetectionsRepo;

  const mockRepository: IEventDetectionsRepo = {
    fetchEventsAndPatientHabits: jest.fn(),
    fetchLatestEventsAndPatientHabits: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventDetectionsService,
        {
          provide: EVENT_DETECTIONS_REPO,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<EventDetectionsService>(EventDetectionsService);
    repository = module.get<IEventDetectionsRepo>(EVENT_DETECTIONS_REPO);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should call fetchEventsAndHabits with repository', async () => {
    const mockResult = {
      'event-detections': [
        { id: 1, event_time: new Date(), event_type: 'test' },
      ],
      'patient-habits': [{ id: 1, created_at: new Date(), patient_id: 123 }],
    };

    const spy = jest
      .spyOn(repository, 'fetchEventsAndPatientHabits')
      .mockResolvedValue(mockResult);

    const result = await service.fetchEventsAndHabits('2024-01-01');

    expect(spy).toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});
