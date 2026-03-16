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
} from './dto/booking.dto';
import type { CreateBookingDto, QueryBookingDto, AvailabilityQueryDto } from './dto/booking.dto';

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

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @Req() req) {
    return this.bookingsService.cancel(id, req.user['sub'], req.user['role']);
  }

  @Patch(':id/check-in')
  @HttpCode(HttpStatus.OK)
  checkIn(@Param('id') id: string, @Req() req) {
    return this.bookingsService.checkIn(id, req.user['role']);
  }

  @Patch(':id/auto-check-in')
  @HttpCode(HttpStatus.OK)
  autoCheckIn(@Param('id') id: string, @Req() req) {
    return this.bookingsService.autoCheckIn(id, req.user['sub'], req.user['role']);
  }

  @Patch(':id/check-out')
  @HttpCode(HttpStatus.OK)
  checkOut(@Param('id') id: string, @Req() req) {
    return this.bookingsService.checkOut(id, req.user['role']);
  }

  @Get('debug-db')
  async debugDb() {
    return this.bookingsService['prisma'].booking.findMany();
  }
}
