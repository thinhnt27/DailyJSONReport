import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './infra/filters/all-exceptions.filter';
import { ResponseWrapperInterceptor } from './infra/interceptors/response-wrapper.interceptor';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  //Set up swagger
  const config = new DocumentBuilder()
    .setTitle('Event Detections API')
    .setDescription('API for Event Detections')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger/index.html', app, document);
  // Apply global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Apply global response wrapper interceptor
  app.useGlobalInterceptors(new ResponseWrapperInterceptor());

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
