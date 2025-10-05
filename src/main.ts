import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './infra/filters/all-exceptions.filter';
import { ResponseWrapperInterceptor } from './infra/interceptors/response-wrapper.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Apply global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Apply global response wrapper interceptor
  app.useGlobalInterceptors(new ResponseWrapperInterceptor());

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
