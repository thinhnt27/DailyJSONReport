import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('EventDetections API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/event-detections (GET)', () => {
    it('should return health check', () => {
      return request(app.getHttpServer())
        .get('/event-detections/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status', 'ok');
          expect(res.body).toHaveProperty('timestamp');
        });
    });

    it('should fetch events and habits with default params', () => {
      return request(app.getHttpServer())
        .get('/event-detections')
        .expect(200)
        .expect((res) => {
          expect(res.body).toBeDefined();
          // May be empty if no data in DB, but should have structure
          expect(typeof res.body).toBe('object');
        });
    });

    it('should accept query parameters', () => {
      return request(app.getHttpServer())
        .get('/event-detections?limit=10&page=1')
        .expect(200)
        .expect((res) => {
          expect(res.body).toBeDefined();
        });
    });
  });
});
