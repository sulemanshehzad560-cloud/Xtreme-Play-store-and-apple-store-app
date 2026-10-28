import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { supportMessages, users, type UserRole } from "../../db/schema.js";
import type { AdminService } from "../admin/admin.service.js";
import type { NotificationService } from "../notifications/notification.service.js";
import { rooms, type RealtimeHub } from "../tracking/realtime.js";
import { HANDOFF, botAnswer } from "./bot.js";
import { seal, unseal } from "../../lib/sealed.js";

type Message = typeof supportMessages.$inferSelect;

export class SupportService {
  constructor(
    private readonly db: Database,
    private readonly notifications: NotificationService,
    private readonly hub: RealtimeHub,
    private readonly admin: AdminService,
    private readonly opts: { tamaraFeePercent: number; cardFeePercent?: number },
  ) {}

  /** The customer's thread; opening it marks our replies as read. */
  async thread(customerId: string) {
    const rows = await this.db.select().from(supportMessages).where(eq(supportMessages.customerId, customerId)).orderBy(supportMessages.createdAt).limit(300);
    await this.db
      .update(supportMessages)
      .set({ readAt: new Date() })
      .where(and(eq(supportMessages.customerId, customerId), inArray(supportMessages.sender, ["bot", "staff"]), isNull(supportMessages.readAt)));
    return rows.map(view);
  }

  /** Customer writes: stored, answered instantly when we can, and passed to the office. */
  async send(customerId: string, body: string) {
    const [mine] = await this.db.insert(supportMessages).values({ customerId, sender: "customer", body: seal(body) }).returning();
    const company = await this.admin.company();
    const ctx = { whatsappDisplay: company.phoneDisplay, tamaraFeePercent: this.opts.tamaraFeePercent, cardFeePercent: this.opts.cardFeePercent };
    const answer = botAnswer(body, ctx);
    let reply: Message | undefined;
    if (answer) {
      [reply] = await this.db.insert(supportMessages).values({ customerId, sender: "bot", body: answer.body }).returning();
    } else {
      // One hand-off note per waiting period, not one per message.
      const [recent] = await this.db
        .select({ id: supportMessages.id })
        .from(supportMessages)
        .where(and(eq(supportMessages.customerId, customerId), eq(supportMessages.sender, "bot"), sql`${supportMessages.createdAt} > now() - interval '30 minutes'`, eq(supportMessages.body, HANDOFF(ctx))))
        .limit(1);
      if (!recent) [reply] = await this.db.insert(supportMessages).values({ customerId, sender: "bot", body: HANDOFF(ctx) }).returning();
    }
    const [who] = await this.db.select({ name: users.fullName, phone: users.phone }).from(users).where(eq(users.id, customerId)).limit(1);
    void this.notifications.notifyAdmins({
      title: `Message from ${who?.name ?? who?.phone ?? "a customer"}`,
      body: body.slice(0, 140),
      data: { type: "support", customerId },
    });
    this.hub.emit(rooms.admins, "support:message", { customerId });
    return [mine!, ...(reply ? [reply] : [])].map(view);
  }

  // ------------------------------------------------------------ office

  async threads(limit = 100) {
    const rows = await this.db.execute<{
      customer_id: string;
      full_name: string | null;
      phone: string | null;
      last_body: string;
      last_sender: string;
      last_at: Date;
      unread: number;
    }>(sql`
      select m.customer_id, u.full_name, u.phone, m.body as last_body, m.sender as last_sender, m.created_at as last_at,
        (select count(*)::int from support_messages x where x.customer_id = m.customer_id and x.sender = 'customer' and x.read_at is null) as unread
      from (select distinct on (customer_id) * from support_messages order by customer_id, created_at desc) m
      join users u on u.id = m.customer_id
      order by m.created_at desc
      limit ${limit}`);
    return rows.rows.map((r) => ({
      customerId: r.customer_id,
      customer: { fullName: r.full_name, phone: r.phone },
      lastMessage: unseal(r.last_body),
      lastSender: r.last_sender,
      lastAt: new Date(r.last_at).toISOString(),
      unread: r.unread,
    }));
  }

  async adminThread(customerId: string) {
    const rows = await this.db.select().from(supportMessages).where(eq(supportMessages.customerId, customerId)).orderBy(supportMessages.createdAt).limit(500);
    await this.db
      .update(supportMessages)
      .set({ readAt: new Date() })
      .where(and(eq(supportMessages.customerId, customerId), eq(supportMessages.sender, "customer"), isNull(supportMessages.readAt)));
    const [who] = await this.db.select({ fullName: users.fullName, phone: users.phone, email: users.email }).from(users).where(eq(users.id, customerId)).limit(1);
    return { customer: who ?? null, messages: rows.map(view) };
  }

  async reply(customerId: string, author: { id: string; role: UserRole }, body: string) {
    const [msg] = await this.db.insert(supportMessages).values({ customerId, sender: "staff", authorId: author.id === "system" ? null : author.id, body: seal(body) }).returning();
    void this.notifications.notify([customerId], { title: "Xtreme team replied", body: body.slice(0, 140), data: { type: "support" } });
    this.hub.emit(rooms.user(customerId), "support:message", { id: msg!.id });
    return view(msg!);
  }

  async unreadForCustomer(customerId: string) {
    const [r] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(supportMessages)
      .where(and(eq(supportMessages.customerId, customerId), inArray(supportMessages.sender, ["bot", "staff"]), isNull(supportMessages.readAt)));
    return { unread: r?.n ?? 0 };
  }
}

function view(m: Message) {
  return { id: m.id, sender: m.sender, body: unseal(m.body), createdAt: m.createdAt.toISOString() };
}

