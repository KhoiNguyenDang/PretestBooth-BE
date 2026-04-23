import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
      // Keep DB session in UTC so timestamptz values are parsed consistently.
      options: '-c timezone=UTC',
    });

    super({
      adapter: new PrismaPg(pool),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
