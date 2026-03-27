import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const preferredPort = Number.parseInt(process.env.PORT ?? '3000', 10);
  const defaultPort = Number.isNaN(preferredPort) ? 3000 : preferredPort;
  const fallbackPort = defaultPort + 1;
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  const explicitOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const allowedOrigins = new Set<string>([
    'http://localhost:3000',
    'http://localhost:3001',
    'https://app.nguyen2207.io.vn',
    'https://api.nguyen2207.io.vn',
    ...explicitOrigins,
  ]);

  const isAllowedProductionOrigin = (origin: string): boolean => {
    try {
      const parsed = new URL(origin);
      return (
        parsed.protocol === 'https:' &&
        (parsed.hostname === 'nguyen2207.io.vn' ||
          parsed.hostname.endsWith('.nguyen2207.io.vn'))
      );
    } catch {
      return false;
    }
  };

  // Keep CORS strict for trusted domains while supporting production subdomains.
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests without Origin header (curl, server-to-server, health checks).
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.has(origin) || isAllowedProductionOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  try {
    await app.listen(defaultPort);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'EADDRINUSE') {
      throw error;
    }

    console.warn(
      `[bootstrap] Port ${defaultPort} is already in use. Retrying on port ${fallbackPort}.`,
    );
    await app.listen(fallbackPort);
  }
}
bootstrap();
