import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const logger = new Logger('Bootstrap');

  // Behind nginx every request otherwise looks like it came from the proxy, so
  // the rate limiter would count the whole world as one client — one abusive
  // caller would lock everyone out. One hop, not `true`: trusting the entire
  // X-Forwarded-For chain lets a client forge its own address and skip the
  // limit altogether.
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api');

  app.use(
    helmet({
      // The API serves JSON only; a CSP here protects nothing and only risks
      // breaking a future embedded doc page. The SPA's CSP lives in nginx.conf,
      // which is where the HTML is actually served.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: { maxAge: 31_536_000, includeSubDomains: true },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // Validated at boot (config/env.schema.ts), so this is always a real origin.
  // No wildcard: the API answers with credentials, and `*` plus credentials is
  // rejected by browsers anyway.
  app.enableCors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-Id'],
    maxAge: 86_400,
  });

  // Receipt images arrive as base64 in the assistant's dev route; everything
  // else is small. Explicit rather than relying on the framework default, so
  // the ceiling is visible and cannot drift.
  app.useBodyParser('json', { limit: '12mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });

  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT || 3011;
  await app.listen(port);
  logger.log(`CryoTech API running on port ${port}`);
}

bootstrap();
