import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import { UpdateBoothPolicySchema, type UpdateBoothPolicyDto } from './dto/booth-policy.dto';
import { BoothPoliciesService } from './booth-policies.service';

@Controller('booth-policies')
@UseGuards(AuthGuard('jwt'))
export class BoothPoliciesController {
  constructor(private readonly boothPoliciesService: BoothPoliciesService) {}

  @Get()
  getBoothPolicyConfig() {
    return this.boothPoliciesService.getBoothPolicyConfig();
  }

  @Patch()
  updateBoothPolicyConfig(
    @Req() req,
    @Body(new ZodValidationPipe(UpdateBoothPolicySchema)) dto: UpdateBoothPolicyDto,
  ) {
    return this.boothPoliciesService.updateBoothPolicyConfig(
      req.user['role'],
      req.user['sub'],
      dto,
    );
  }
}
