import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import {
  realtimeEvents,
  type BookingRealtimePayload,
  type BoothNotificationPayload,
  type BoothStatusUpdatedPayload,
  type MonitoringUpdatedPayload,
  type SessionTerminatedPayload,
  type SessionTimerAdjustedPayload,
} from './realtime.types';

interface WsUser {
  sub: string;
  role: string;
}

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: ['http://localhost:3001', 'http://localhost:3000'],
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  private getAccessSecret() {
    return process.env.JWT_ACCESS_SECRET;
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const rawAuth = client.handshake.headers.authorization;
    if (typeof rawAuth === 'string' && rawAuth.startsWith('Bearer ')) {
      return rawAuth.slice('Bearer '.length);
    }

    return null;
  }

  private getUser(client: Socket): WsUser | null {
    return (client.data.user as WsUser | undefined) ?? null;
  }

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify<WsUser>(token, {
        secret: this.getAccessSecret(),
      });

      client.data.user = payload;
      client.join(`user:${payload.sub}`);

      if (payload.role === 'ADMIN' || payload.role === 'LECTURER') {
        client.join('admin:global');
      }

      this.logger.debug(`Socket connected: ${client.id} (${payload.sub}/${payload.role})`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('realtime.join.booth')
  handleJoinBooth(@ConnectedSocket() client: Socket, @MessageBody() boothId: string) {
    const user = this.getUser(client);
    if (!user || !boothId) {
      return { ok: false };
    }

    // Admin/Lecturer can inspect all booths; students join booth room after booth-login flow.
    if (user.role === 'ADMIN' || user.role === 'LECTURER' || user.role === 'STUDENT') {
      client.join(`booth:${boothId}`);
      return { ok: true };
    }

    return { ok: false };
  }

  emitBoothStatusUpdated(payload: BoothStatusUpdatedPayload) {
    this.server.to('admin:global').emit(realtimeEvents.boothStatusUpdated, payload);
    this.server.to(`booth:${payload.boothId}`).emit(realtimeEvents.boothStatusUpdated, payload);
  }

  emitBookingCheckin(payload: BookingRealtimePayload) {
    this.server.to('admin:global').emit(realtimeEvents.bookingCheckin, payload);
    this.server.to(`booth:${payload.boothId}`).emit(realtimeEvents.bookingCheckin, payload);
    this.server.to(`user:${payload.userId}`).emit(realtimeEvents.bookingCheckin, payload);
  }

  emitBookingCheckout(payload: BookingRealtimePayload) {
    this.server.to('admin:global').emit(realtimeEvents.bookingCheckout, payload);
    this.server.to(`booth:${payload.boothId}`).emit(realtimeEvents.bookingCheckout, payload);
    this.server.to(`user:${payload.userId}`).emit(realtimeEvents.bookingCheckout, payload);
  }

  emitDashboardStatsUpdated() {
    this.server.to('admin:global').emit(realtimeEvents.dashboardStatsUpdated, {
      emittedAt: new Date().toISOString(),
    });
  }

  emitBoothNotification(payload: BoothNotificationPayload) {
    if (payload.userId) {
      this.server.to(`user:${payload.userId}`).emit(realtimeEvents.boothNotification, payload);
    }

    if (payload.boothId) {
      this.server.to(`booth:${payload.boothId}`).emit(realtimeEvents.boothNotification, payload);
    }

    this.server.to('admin:global').emit(realtimeEvents.boothNotification, payload);
  }

  emitMonitoringUpdated(payload: MonitoringUpdatedPayload) {
    this.server.to('admin:global').emit(realtimeEvents.monitoringUpdated, payload);

    if (payload.boothId) {
      this.server.to(`booth:${payload.boothId}`).emit(realtimeEvents.monitoringUpdated, payload);
    }

    if (payload.userId) {
      this.server.to(`user:${payload.userId}`).emit(realtimeEvents.monitoringUpdated, payload);
    }
  }

  emitSessionTimerAdjusted(payload: SessionTimerAdjustedPayload) {
    this.server.to('admin:global').emit(realtimeEvents.sessionTimerAdjusted, payload);
    this.server.to(`user:${payload.userId}`).emit(realtimeEvents.sessionTimerAdjusted, payload);

    if (payload.boothId) {
      this.server.to(`booth:${payload.boothId}`).emit(realtimeEvents.sessionTimerAdjusted, payload);
    }
  }

  emitSessionTerminated(payload: SessionTerminatedPayload) {
    this.server.to('admin:global').emit(realtimeEvents.sessionTerminated, payload);
    this.server.to(`user:${payload.userId}`).emit(realtimeEvents.sessionTerminated, payload);

    if (payload.boothId) {
      this.server.to(`booth:${payload.boothId}`).emit(realtimeEvents.sessionTerminated, payload);
    }
  }
}
