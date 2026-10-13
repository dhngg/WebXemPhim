import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX } from '@rental/shared';
import helmet from 'helmet';
import type { Environment } from './environment';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService<Environment, true>);
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Rental Platform API')
        .setDescription('Sprint 0: health and infrastructure only')
        .setVersion('0.1.0')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
      swaggerOptions: { persistAuthorization: false },
    });
  }
}
