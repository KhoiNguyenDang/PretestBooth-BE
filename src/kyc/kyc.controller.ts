import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import { KycRegisterSchema, type KycRegisterDto } from './dto/kyc-register.dto';
import {
  ApproveKycManualReviewSchema,
  QueryKycManualReviewSchema,
  RejectKycManualReviewSchema,
  RequestKycManualReviewSchema,
  type ApproveKycManualReviewDto,
  type QueryKycManualReviewDto,
  type RejectKycManualReviewDto,
  type RequestKycManualReviewDto,
} from './dto/kyc-manual-review.dto';
import {
  UpdateKycCardThresholdSchema,
  type UpdateKycCardThresholdDto,
} from './dto/kyc-card-threshold.dto';
import { KycService } from './kyc.service';

@Controller('kyc')
@UseGuards(AuthGuard('jwt'))
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('register')
  register(@Req() req, @Body(new ZodValidationPipe(KycRegisterSchema)) dto: KycRegisterDto) {
    return this.kycService.register(req.user['sub'], dto);
  }

  @Get('status')
  status(@Req() req) {
    return this.kycService.getStatus(req.user['sub']);
  }

  @Get('card-threshold')
  getCardThreshold() {
    return this.kycService.getKycCardThresholdConfig();
  }

  @Post('card-threshold')
  updateCardThreshold(
    @Req() req,
    @Body(new ZodValidationPipe(UpdateKycCardThresholdSchema)) dto: UpdateKycCardThresholdDto,
  ) {
    return this.kycService.updateKycCardThreshold(req.user['role'], req.user['sub'], dto.threshold);
  }

  @Post('manual-review/request')
  requestManualReview(
    @Req() req,
    @Body(new ZodValidationPipe(RequestKycManualReviewSchema)) dto: RequestKycManualReviewDto,
  ) {
    return this.kycService.requestManualReview(req.user['sub'], req.user['role'], dto);
  }

  @Get('manual-review/pending')
  pendingManualReviews(
    @Req() req,
    @Query(new ZodValidationPipe(QueryKycManualReviewSchema)) query: QueryKycManualReviewDto,
  ) {
    return this.kycService.getPendingManualReviews(req.user['sub'], req.user['role'], query);
  }

  @Get('manual-review/:studentId')
  manualReviewDetail(@Req() req, @Param('studentId') studentId: string) {
    return this.kycService.getManualReviewDetail(req.user['sub'], req.user['role'], studentId);
  }

  @Post('manual-review/:studentId/approve')
  approveManualReview(
    @Req() req,
    @Param('studentId') studentId: string,
    @Body(new ZodValidationPipe(ApproveKycManualReviewSchema)) dto: ApproveKycManualReviewDto,
  ) {
    return this.kycService.approveManualReview(req.user['sub'], req.user['role'], studentId, dto);
  }

  @Post('manual-review/:studentId/reject')
  rejectManualReview(
    @Req() req,
    @Param('studentId') studentId: string,
    @Body(new ZodValidationPipe(RejectKycManualReviewSchema)) dto: RejectKycManualReviewDto,
  ) {
    return this.kycService.rejectManualReview(req.user['sub'], req.user['role'], studentId, dto);
  }
}
