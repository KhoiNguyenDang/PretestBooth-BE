import { z } from 'zod';

export const RequestKycManualReviewSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Lý do yêu cầu duyệt thủ công phải có ít nhất 5 ký tự')
    .max(500, 'Lý do yêu cầu duyệt thủ công tối đa 500 ký tự')
    .optional(),
});

export type RequestKycManualReviewDto = z.output<typeof RequestKycManualReviewSchema>;

export const QueryKycManualReviewSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  search: z.string().trim().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QueryKycManualReviewDto = z.output<typeof QueryKycManualReviewSchema>;

export const ApproveKycManualReviewSchema = z.object({
  notes: z
    .string()
    .trim()
    .min(3, 'Ghi chú duyệt phải có ít nhất 3 ký tự')
    .max(500, 'Ghi chú duyệt tối đa 500 ký tự')
    .optional(),
});

export type ApproveKycManualReviewDto = z.output<typeof ApproveKycManualReviewSchema>;

export const RejectKycManualReviewSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Lý do từ chối phải có ít nhất 5 ký tự')
    .max(500, 'Lý do từ chối tối đa 500 ký tự'),
  notes: z
    .string()
    .trim()
    .min(3, 'Ghi chú từ chối phải có ít nhất 3 ký tự')
    .max(500, 'Ghi chú từ chối tối đa 500 ký tự')
    .optional(),
});

export type RejectKycManualReviewDto = z.output<typeof RejectKycManualReviewSchema>;

export const QueryVerifiedKycSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  search: z.string().trim().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QueryVerifiedKycDto = z.output<typeof QueryVerifiedKycSchema>;

export const CancelVerifiedKycSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Lý do hủy xác thực phải có ít nhất 5 ký tự')
    .max(500, 'Lý do hủy xác thực tối đa 500 ký tự'),
});

export type CancelVerifiedKycDto = z.output<typeof CancelVerifiedKycSchema>;
