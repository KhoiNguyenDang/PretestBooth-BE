export const realtimeEvents = {
  boothStatusUpdated: 'booth.status.updated',
  bookingCheckin: 'booking.checkin',
  bookingCheckout: 'booking.checkout',
  dashboardStatsUpdated: 'dashboard.stats.updated',
  boothNotification: 'booth.notification',
} as const;

export interface BoothStatusUpdatedPayload {
  boothId: string;
  status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
  previousStatus: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
  note: string;
  changedByUserId: string;
  changedAt: string;
}

export interface BookingRealtimePayload {
  bookingId: string;
  boothId: string;
  userId: string;
  status: 'CHECKED_IN' | 'COMPLETED';
  type: 'PRACTICE' | 'EXAM';
  startTime: string;
  endTime: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  emittedAt: string;
}

export interface BoothNotificationPayload {
  userId?: string;
  boothId?: string;
  message: string;
  level?: 'info' | 'success' | 'warning' | 'error';
  emittedAt: string;
}
