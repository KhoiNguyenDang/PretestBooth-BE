import { z } from 'zod';

export const ReportProctoringEventSchema = z.object({
  sessionId: z.string().uuid(),
  eventType: z.enum(['TAB_SWITCH', 'WINDOW_BLUR', 'FULLSCREEN_EXIT', 'COPY_PASTE', 'MULTIPLE_FACES', 'NO_FACE', 'DEVICE_DISCONNECTED']),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type ReportProctoringEventDto = z.output<typeof ReportProctoringEventSchema>;
