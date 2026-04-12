import { z } from 'zod';

export const BoothPolicyInputSchema = z.object({
  bookingMinDaysInAdvance: z.coerce.number().int().min(0).max(120),
  bookingMaxDaysInAdvance: z.coerce.number().int().min(1).max(365),
  bookingCancellationCutoffHours: z.coerce.number().int().min(0).max(720),
  walkInPracticeEnabled: z.boolean(),
  warnBeforeNextExamMinutes: z.coerce.number().int().min(1).max(240),
  forceLogoutBeforeNextExamMinutes: z.coerce.number().int().min(0).max(240),
  noShowGraceMinutes: z.coerce.number().int().min(0).max(240),
});

export type BoothPolicyConfigDto = z.output<typeof BoothPolicyInputSchema>;

export const UpdateBoothPolicySchema = BoothPolicyInputSchema.partial().superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Khong co du lieu de cap nhat',
    });
  }
});

export type UpdateBoothPolicyDto = z.output<typeof UpdateBoothPolicySchema>;
