import type { Server } from "socket.io";

export const rooms = {
  user: (id: string) => `user:${id}`,
  booking: (id: string) => `booking:${id}`,
  admins: "admins",
} as const;

/**
 * Thin seam between domain services and Socket.IO, so services can publish events
 * without knowing about sockets (and tests can run without a socket server).
 */
export class RealtimeHub {
  private io: Server | null = null;

  attach(io: Server) {
    this.io = io;
  }

  emit(room: string | string[], event: string, payload: unknown) {
    this.io?.to(room).emit(event, payload);
  }

  /** Makes every socket of `userId` leave a booking room (e.g. after unassignment). */
  leave(userId: string, room: string) {
    this.io?.in(rooms.user(userId)).socketsLeave(room);
  }
}
