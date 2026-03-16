import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('student')
  getStudentStats(@Req() req) {
    return this.dashboardService.getStudentStats(req.user['sub']);
  }

  @Get('admin')
  getAdminStats(@Req() req) {
    return this.dashboardService.getAdminStats(req.user['role']);
  }
}
