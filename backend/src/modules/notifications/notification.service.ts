import type { FastifyBaseLogger } from "fastify";
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { notifications, pushTokens, users } from "../../db/schema.js";
import { rooms, type RealtimeHub } from "../tracking/realtime.js";
import type { PushSender } from "./push.js";

export interface NotificationInput {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export class NotificationService {
  constructor(
    private readonly db: Database,
    private readonly push: PushSender,
    private readonly hub: RealtimeHub,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Saves an in-app notification, pushes it to the user's devices and the open app.
   * Never throws: a failed notification must not fail the booking action behind it.
   */
  async notify(userIds: string[], input: NotificationInput): Promise<void> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;
    try {
      const rows = await this.db
        .insert(notifications)
        .values(ids.map((userId) => ({ userId, title: input.title, body: input.body, data: input.data ?? null })))
        .returning();
      for (const row of rows) this.hub.emit(rooms.user(row.userId), "notification", serialize(row));

      const tokens = await this.db.select().from(pushTokens).where(inArray(pushTokens.userId, ids));
      if (tokens.length === 0) return;
      const { invalidTokens } = await this.push.send(
        tokens.map((t) => ({ to: t.token, title: input.title, body: input.body, data: input.data })),
      );
      if (invalidTokens.length) await this.db.delete(pushTokens).where(inArray(pushTokens.token, invalidTokens));
    } catch (err) {
      this.log.error({ err }, "notification delivery failed");
    }
  }

  async notifyAdmins(input: NotificationInput): Promise<void> {
    const admins = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), isNull(users.deletedAt), isNull(users.blockedAt)));
    await this.notify(admins.map((a) => a.id), input);
  }

  async list(userId: string, opts: { limit: number; before?: Date | undefined }) {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), opts.before ? lt(notifications.createdAt, opts.before) : undefined))
      .orderBy(desc(notifications.createdAt))
      .limit(opts.limit);
    return rows.map(serialize);
  }

  async markRead(userId: string, ids: string[] | "all") {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          ids === "all" ? undefined : inArray(notifications.id, ids),
        ),
      );
  }
}

function serialize(row: typeof notifications.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    data: row.data,
    read: Boolean(row.readAt),
    createdAt: row.createdAt.toISOString(),
  };
}
