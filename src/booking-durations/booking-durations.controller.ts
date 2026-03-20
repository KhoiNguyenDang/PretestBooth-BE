import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BookingDurationsService } from './booking-durations.service';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import {
  CreateBookingDurationSchema,
  QueryBookingDurationSchema,
  UpdateBookingDurationSchema,
} from './dto/booking-duration.dto';
import type {
  CreateBookingDurationDto,
  QueryBookingDurationDto,
  UpdateBookingDurationDto,
} from './dto/booking-duration.dto';

@Controller('booking-durations')
@UseGuards(AuthGuard('jwt'))
export class BookingDurationsController {
  constructor(private readonly bookingDurationsService: BookingDurationsService) {}

  @Get()
  findAll(@Query(new ZodValidationPipe(QueryBookingDurationSchema)) query: QueryBookingDurationDto) {
    return this.bookingDurationsService.findAll(query);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateBookingDurationSchema)) dto: CreateBookingDurationDto,
    @Req() req,
  ) {
    return this.bookingDurationsService.create(dto, req.user['role']);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBookingDurationSchema)) dto: UpdateBookingDurationDto,
    @Req() req,
  ) {
    return this.bookingDurationsService.update(id, dto, req.user['role']);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    return this.bookingDurationsService.remove(id, req.user['role']);
  }
}
