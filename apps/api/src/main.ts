import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { configureApplication } from './config/configure-application';
import type { Environment } from './config/environment';

async function bootstrap(): Promise<void> {
  // Import within the error boundary so invalid .env values are never dumped by the runtime.
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  configureApplication(app);
  app.enableShutdownHooks();
  const config = app.get(ConfigService<Environment, true>);
  await app.listen(config.get('PORT', { infer: true }), config.get('HOST', { infer: true }));
}

void bootstrap().catch(() => {
  console.error('API startup failed. Check environment configuration and database availability.');
  process.exitCode = 1;
});
