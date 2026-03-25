import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const preferredPort = Number.parseInt(process.env.PORT ?? '3000', 10);
  const defaultPort = Number.isNaN(preferredPort) ? 3000 : preferredPort;
  const fallbackPort = defaultPort === 3000 ? 3002 : defaultPort + 1;
  const app = await NestFactory.create(AppModule);

  // Cập nhật CORS để hỗ trợ cả dev và production
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://app.nguyen2207.io.vn', // Frontend production
      'https://api.nguyen2207.io.vn', // Backend production
    ],
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
