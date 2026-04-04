import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BookingsService } from './bookings.service';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import {
  CreateBookingSchema,
  QueryBookingSchema,
  AvailabilityQuerySchema,
  ForceCheckoutSchema,
  MonitoringNotifySchema,
  QueryActiveMonitoringSchema,
} from './dto/booking.dto';
import type {
  AvailabilityQueryDto,
  CreateBookingDto,
  ForceCheckoutDto,
  MonitoringNotifyDto,
  QueryActiveMonitoringDto,
  QueryBookingDto,
} from './dto/booking.dto';

@Controller('bookings')
@UseGuards(AuthGuard('jwt'))
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateBookingSchema)) dto: CreateBookingDto,
    @Req() req,
  ) {
    return this.bookingsService.create(req.user['sub'], req.user['role'], dto);
  }

  @Get()
  findAll(
    @Query(new ZodValidationPipe(QueryBookingSchema)) query: QueryBookingDto,
    @Req() req,
  ) {
    return this.bookingsService.findAll(req.user['sub'], req.user['role'], query);
  }

  @Get('availability')
  getAvailability(
    @Query(new ZodValidationPipe(AvailabilityQuerySchema)) query: AvailabilityQueryDto,
  ) {
    return this.bookingsService.getAvailability(query.date);
  }

  @Get('monitor/active')
  getActiveMonitoringSessions(
    @Query(new ZodValidationPipe(QueryActiveMonitoringSchema)) query: QueryActiveMonitoringDto,
    @Req() req,
  ) {
    return this.bookingsService.findActiveMonitoringSessions(req.user['sub'], req.user['role'], query);
  }

  @Post(':id/force-checkout')
  @HttpCode(HttpStatus.OK)
  forceCheckout(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ForceCheckoutSchema)) dto: ForceCheckoutDto,
    @Req() req,
  ) {
    return this.bookingsService.forceCheckoutByMonitor(id, dto, req.user['sub'], req.user['role']);
  }

  @Post(':id/notify')
  @HttpCode(HttpStatus.OK)
  notifyByMonitor(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(MonitoringNotifySchema)) dto: MonitoringNotifyDto,
    @Req() req,
  ) {
    return this.bookingsService.notifyByMonitor(id, dto, req.user['sub'], req.user['role']);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @Req() req) {
    return this.bookingsService.cancel(id, req.user['sub'], req.user['role']);
  }

  @Get('debug-db')
  async debugDb() {
    return this.bookingsService['prisma'].booking.findMany();
  }
}
