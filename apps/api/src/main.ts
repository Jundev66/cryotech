import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const logger = new Logger('Bootstrap');

  // Without this, `onModuleDestroy` never runs on SIGTERM — which is how a
  // redeploy or a sleeping free instance stops — and receipts still batching
  // lose their summary, and the OCR worker is killed mid-read.
  app.enableShutdownHooks();

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

  // Exact origins only (validated at boot in config/env.schema.ts).
  // No wildcard: the API answers with credentials, and `*` plus credentials is
  // rejected by browsers anyway. Supports single or comma-separated origins.
  const rawCors = process.env.CORS_ORIGIN || 'http://localhost:3002';
  const configuredOrigins = rawCors
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const allowedOrigins = new Set([
    ...configuredOrigins,
    'capacitor://localhost',
    'http://localhost',
    'http://localhost:3002',
    'http://localhost:5173',
    'https://mobile-ochre-pi.vercel.app',
    'https://cryotech-main.vercel.app',
  ]);

  app.enableCors({
    origin: (requestOrigin, callback) => {
      // Allow requests with no origin header (e.g. mobile native plugins, curl, server-to-server)
      if (!requestOrigin || allowedOrigins.has(requestOrigin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
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
