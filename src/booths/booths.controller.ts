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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BoothsService } from './booths.service';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import {
  CreateBoothSchema,
  UpdateBoothSchema,
  QueryBoothSchema,
  GenerateActivationOtpSchema,
  ForceBoothLogoutSchema,
} from './dto/booth.dto';
import type {
  CreateBoothDto,
  UpdateBoothDto,
  QueryBoothDto,
  GenerateActivationOtpDto,
  ForceBoothLogoutDto,
} from './dto/booth.dto';

@Controller('booths')
@UseGuards(AuthGuard('jwt'))
export class BoothsController {
  constructor(private readonly boothsService: BoothsService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateBoothSchema)) dto: CreateBoothDto,
    @Req() req,
  ) {
    return this.boothsService.create(dto, req.user['role'], req.user['sub']);
  }

  @Get()
  findAll(@Query(new ZodValidationPipe(QueryBoothSchema)) query: QueryBoothDto) {
    return this.boothsService.findAll(query);
  }

  @Get('available')
  async getAvailableBooths(
    @Query('date') dateStr: string,
    @Query('startTime') startTimeStr: string,
    @Query('endTime') endTimeStr: string,
  ) {
    const date = new Date(dateStr);
    const startTime = new Date(startTimeStr);
    const endTime = new Date(endTimeStr);
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
    return this.boothsService.update(id, dto, req.user['role'], req.user['sub']);
  }

  @Get(':id/status-logs')
  getStatusLogs(@Param('id') id: string) {
    return this.boothsService.getStatusLogs(id);
  }

  @Post('activation-otp')
  @HttpCode(HttpStatus.OK)
  generateActivationOtp(
    @Body(new ZodValidationPipe(GenerateActivationOtpSchema)) dto: GenerateActivationOtpDto,
    @Req() req,
  ) {
    return this.boothsService.generateActivationOtp(dto.boothCode, req.user['role'], req.user['sub']);
  }

  @Post(':id/force-logout')
  @HttpCode(HttpStatus.OK)
  forceLogoutBooth(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ForceBoothLogoutSchema)) dto: ForceBoothLogoutDto,
    @Req() req,
  ) {
    return this.boothsService.forceDeactivateBoothSessionByBoothId(
      id,
      dto.reason,
      req.user['role'],
      req.user['sub'],
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Req() req) {
    return this.boothsService.remove(id, req.user['role'], req.user['sub']);
  }
}
