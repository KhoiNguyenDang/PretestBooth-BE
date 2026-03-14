import {
  Controller, Get, Post, Body, Query, UseGuards, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PointsService } from './points.service';

@Controller('points')
@UseGuards(AuthGuard('jwt'))
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get('me')
  getMyPoints(@Req() req) {
    return this.pointsService.getMyPoints(req.user['sub']);
  }

  @Get('history')
  getHistory(
    @Req() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.pointsService.getHistory(
      req.user['sub'],
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('leaderboard')
  getLeaderboard(@Query('limit') limit?: string) {
    return this.pointsService.getLeaderboard(limit ? parseInt(limit) : 20);
  }

  @Post('adjust')
  @HttpCode(HttpStatus.OK)
  manualAdjust(
    @Req() req,
    @Body() body: { userId: string; points: number; reason: string },
  ) {
    return this.pointsService.manualAdjust(
      req.user['role'],
      body.userId,
      body.points,
      body.reason,
    );
  }
}
