import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BoothsService } from './booths.service';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import { CreateBoothSchema, UpdateBoothSchema, QueryBoothSchema } from './dto/booth.dto';
import type { CreateBoothDto, UpdateBoothDto, QueryBoothDto } from './dto/booth.dto';

@Controller('booths')
@UseGuards(AuthGuard('jwt'))
export class BoothsController {
  constructor(private readonly boothsService: BoothsService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateBoothSchema)) dto: CreateBoothDto,
    @Req() req,
  ) {
    return this.boothsService.create(dto, req.user['role']);
  }

  @Get()
  findAll(@Query(new ZodValidationPipe(QueryBoothSchema)) query: QueryBoothDto) {
    return this.boothsService.findAll(query);
  }

  @Get('available')
  getAvailableBooths(
    @Query('date') dateStr: string,
    @Query('startTime') startTimeStr: string,
    @Query('endTime') endTimeStr: string,
  ) {
    const date = new Date(dateStr);
    const startTime = new Date(startTimeStr);
    const endTime = new Date(endTimeStr);

    if (isNaN(date.getTime()) || isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      throw new BadRequestException('Tham số ngày/giờ không hợp lệ');
    }

    return this.boothsService.getAvailableBooths(date, startTime, endTime);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.boothsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBoothSchema)) dto: UpdateBoothDto,
    @Req() req,
  ) {
    return this.boothsService.update(id, dto, req.user['role']);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Req() req) {
    return this.boothsService.remove(id, req.user['role']);
  }
}
