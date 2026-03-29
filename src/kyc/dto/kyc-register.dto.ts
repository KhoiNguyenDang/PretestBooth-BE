import { z } from 'zod';

export const LivenessProofSchema = z.object({
  action: z.enum(['BLINK', 'SMILE']),
  passed: z.boolean(),
  confidence: z.number().min(0).max(1).optional(),
  challengeId: z.string().min(1).optional(),
});

export const KycRegisterSchema = z.object({
  image: z.string().min(100, 'Ảnh khuôn mặt không hợp lệ'),
  consentVersion: z.string().min(1, 'Thiếu phiên bản đồng ý điều khoản'),
  liveness: LivenessProofSchema,
});

export type KycRegisterDto = z.output<typeof KycRegisterSchema>;
