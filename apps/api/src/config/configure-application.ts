import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX } from '@rental/shared';
import helmet from 'helmet';
import type { Application } from 'express';
import type { Environment } from './environment';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService<Environment, true>);
  const proxies = config.get('TRUSTED_PROXY_CIDRS', { infer: true });
  const expressApp = app.getHttpAdapter().getInstance() as Application;
  expressApp.set('trust proxy', proxies.length ? proxies : false);
  const refreshCookieName =
    config.get('AUTH_REFRESH_COOKIE_NAME', { infer: true }) ?? 'refreshToken';
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: config.get('AUTH_ENABLED', { infer: true }),
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Protection'],
    exposedHeaders: ['Retry-After'],
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
        .setDescription(
          'Rental Platform API; register/login are implemented, while remaining Auth flows are contract-only',
        )
        .setVersion('0.1.0')
        .addBearerAuth()
        .addCookieAuth(refreshCookieName, { type: 'apiKey', in: 'cookie' }, 'refreshToken')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
      swaggerOptions: { persistAuthorization: false },
    });
  }
}
