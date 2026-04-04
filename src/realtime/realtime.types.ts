export const realtimeEvents = {
  boothStatusUpdated: 'booth.status.updated',
  bookingCheckin: 'booking.checkin',
  bookingCheckout: 'booking.checkout',
  dashboardStatsUpdated: 'dashboard.stats.updated',
  boothNotification: 'booth.notification',
  monitoringUpdated: 'monitoring.updated',
  sessionTimerAdjusted: 'session.timer.adjusted',
  sessionTerminated: 'session.terminated',
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

export interface MonitoringUpdatedPayload {
  scope: 'BOOKING' | 'BOOTH' | 'EXAM' | 'PRACTICE';
  action:
    | 'CHECKIN'
    | 'CHECKOUT'
    | 'FORCE_CHECKOUT'
    | 'FORCE_LOGOUT_BOOTH'
    | 'START'
    | 'SUBMIT'
    | 'ABORT'
    | 'EXTEND'
    | 'NOTIFY';
  bookingId?: string;
  boothId?: string;
  userId?: string;
  sessionType?: 'EXAM' | 'PRACTICE';
  sessionId?: string;
  emittedAt: string;
}

export interface SessionTimerAdjustedPayload {
  sessionType: 'EXAM' | 'PRACTICE';
  sessionId: string;
  userId: string;
  boothId?: string;
  expiresAt: string;
  reason: string;
  emittedAt: string;
}

export interface SessionTerminatedPayload {
  sessionType: 'EXAM' | 'PRACTICE';
  sessionId: string;
  userId: string;
  boothId?: string;
  status: string;
  reason?: string;
  emittedAt: string;
}
