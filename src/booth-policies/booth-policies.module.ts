import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BoothPoliciesController } from './booth-policies.controller';
import { BoothPoliciesService } from './booth-policies.service';

@Module({
  imports: [PrismaModule],
  controllers: [BoothPoliciesController],
  providers: [BoothPoliciesService],
  exports: [BoothPoliciesService],
})
export class BoothPoliciesModule {}
