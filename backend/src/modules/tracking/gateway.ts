import type { FastifyInstance } from "fastify";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { z } from "zod";
import type { Container } from "../../container.js";
import { AppError } from "../../lib/errors.js";
import { pingSchema } from "../staff/staff.routes.js";
import { rooms } from "./realtime.js";

type Ack = (res: { ok: true; data?: unknown } | { ok: false; error: { code: string; message: string } }) => void;

/**
 * Socket.IO endpoint (path /realtime) for live updates.
 *
 * Client → server:  booking:subscribe {bookingId}, booking:unsubscribe {bookingId},
 *                   location:update {lat,lng,...}  (staff only)
 * Server → client:  booking:status, staff:location, notification,
 *                   booking:created / staff:status (admins)
 */
export async function attachRealtime(app: FastifyInstance, c: Container): Promise<Server> {
  const io = new Server(app.server, {
    path: "/realtime",
    cors: { origin: c.env.CORS_ORIGINS.length ? c.env.CORS_ORIGINS : true },
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });

  // Several API instances share rooms through Redis.
  if (c.env.REDIS_URL) {
    const pub = new Redis(c.env.REDIS_URL);
    const sub = pub.duplicate();
    io.adapter(createAdapter(pub, sub));
    app.addHook("onClose", async () => {
      await Promise.all([pub.quit(), sub.quit()]);
    });
  }

  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: string }).token;
      if (!token) throw new Error("missing token");
      const claims = await c.tokens.verifyAccess(token);
      const user = await c.auth.activeUser(claims.sub);
      socket.data.user = { id: user.id, role: user.role };
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as { id: string; role: "customer" | "staff" | "admin" };
    void socket.join(rooms.user(user.id));
    if (user.role === "admin") void socket.join(rooms.admins);

    const handle = <T>(schema: z.ZodType<T>, fn: (input: T) => Promise<unknown>) => async (raw: unknown, ack?: Ack) => {
      const reply: Ack = typeof ack === "function" ? ack : () => undefined;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return reply({ ok: false, error: { code: "validation_error", message: parsed.error.message } });
      try {
        reply({ ok: true, data: await fn(parsed.data) });
      } catch (err) {
        if (err instanceof AppError) return reply({ ok: false, error: { code: err.code, message: err.message } });
        app.log.error({ err }, "socket handler failed");
        reply({ ok: false, error: { code: "internal_error", message: "Something went wrong" } });
      }
    };

    const bookingRef = z.object({ bookingId: z.uuid() });

    socket.on(
      "booking:subscribe",
      handle(bookingRef, async ({ bookingId }) => {
        const snapshot = await c.bookings.tracking(bookingId, user); // throws 404 unless allowed
        await socket.join(rooms.booking(bookingId));
        return snapshot;
      }),
    );

    socket.on(
      "booking:unsubscribe",
      handle(bookingRef, async ({ bookingId }) => {
        await socket.leave(rooms.booking(bookingId));
        return null;
      }),
    );

    if (user.role === "staff") {
      socket.on(
        "location:update",
        handle(pingSchema, (ping) => c.staff.ingest(user.id, [ping])),
      );
    }
  });

  c.hub.attach(io);
  app.addHook("onClose", async () => {
    await io.close();
  });
  return io;
}
