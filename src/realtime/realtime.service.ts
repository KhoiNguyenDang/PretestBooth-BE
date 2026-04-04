import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import type {
  BookingRealtimePayload,
  BoothNotificationPayload,
  BoothStatusUpdatedPayload,
  MonitoringUpdatedPayload,
  SessionTerminatedPayload,
  SessionTimerAdjustedPayload,
} from './realtime.types';

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  boothStatusUpdated(payload: BoothStatusUpdatedPayload) {
    this.gateway.emitBoothStatusUpdated(payload);
    this.gateway.emitDashboardStatsUpdated();
  }

  bookingCheckin(payload: BookingRealtimePayload) {
    this.gateway.emitBookingCheckin(payload);
    this.gateway.emitDashboardStatsUpdated();
  }

  bookingCheckout(payload: BookingRealtimePayload) {
    this.gateway.emitBookingCheckout(payload);
    this.gateway.emitDashboardStatsUpdated();
  }

  notify(payload: BoothNotificationPayload) {
    this.gateway.emitBoothNotification(payload);
  }

  monitoringUpdated(payload: MonitoringUpdatedPayload) {
    this.gateway.emitMonitoringUpdated(payload);
    this.gateway.emitDashboardStatsUpdated();
  }

  sessionTimerAdjusted(payload: SessionTimerAdjustedPayload) {
    this.gateway.emitSessionTimerAdjusted(payload);
    this.gateway.emitDashboardStatsUpdated();
  }

  sessionTerminated(payload: SessionTerminatedPayload) {
    this.gateway.emitSessionTerminated(payload);
    this.gateway.emitDashboardStatsUpdated();
  }
}
