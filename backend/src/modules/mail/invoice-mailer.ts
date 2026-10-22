import type { FastifyBaseLogger } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { bookings, users } from "../../db/schema.js";
import { notFound } from "../../lib/errors.js";
import type { NotificationService } from "../notifications/notification.service.js";
import type { PaymentService } from "../payments/payment.service.js";
import { invoiceEmail, type InvoiceData } from "./invoice-email.js";
import type { Mailer } from "./mailer.js";

const SYSTEM = { id: "00000000-0000-0000-0000-000000000000", role: "admin" as const };
const PAID = ["paid", "partially_refunded"];

/**
 * Emails the tax invoice once a job is both completed and paid (whichever happens last),
 * exactly once per booking. The office can resend it from the dashboard.
 */
export class InvoiceMailer {
  constructor(
    private readonly db: Database,
    private readonly payments: PaymentService,
    private readonly notifications: NotificationService,
    private readonly mailer: Mailer,
    private readonly config: { publicUrl: string },
    private readonly log: FastifyBaseLogger,
  ) {}

  /** Sends the invoice if the booking is completed and paid and none was sent yet. */
  async sendIfDue(bookingId: string): Promise<void> {
    const [claimed] = await this.db
      .update(bookings)
      .set({ invoiceSentAt: new Date() })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, "completed"), isNull(bookings.invoiceSentAt)))
      .returning();
    if (!claimed) return;
    if (!PAID.includes(claimed.paymentStatus)) {
      await this.release(bookingId);
      return;
    }
    const result = await this.deliver(claimed.id).catch((err: unknown) => ({ sent: false as const, reason: "error" as const, err }));
    if (!result.sent) {
      await this.release(bookingId);
      if (result.reason === "error") {
        this.log.error({ err: (result as { err?: unknown }).err, bookingId }, "invoice email failed");
        void this.notifications.notifyAdmins({
          title: `Invoice email failed: ${claimed.reference}`,
          body: "Check the email settings, then resend it from the booking.",
          data: { type: "booking", bookingId },
        });
      }
    }
  }

  /** Office "Email invoice" button: sends now, even if it was sent before. */
  async resend(bookingId: string) {
    const result = await this.deliver(bookingId);
    return result.sent ? { sentTo: result.to } : { sentTo: null, reason: result.reason };
  }

  private async deliver(bookingId: string): Promise<{ sent: true; to: string } | { sent: false; reason: "no_email" }> {
    const [booking] = await this.db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) throw notFound("Booking");
    const [customer] = await this.db.select().from(users).where(eq(users.id, booking.customerId)).limit(1);
    if (!customer?.email) {
      void this.notifications.notify([booking.customerId], {
        title: "Add your email for invoices",
        body: `Your invoice for ${booking.reference} is in the app. Add your email in Account to get invoices by email.`,
        data: { type: "booking", bookingId },
      });
      return { sent: false, reason: "no_email" };
    }
    const invoice = (await this.payments.invoice(bookingId, SYSTEM)) as InvoiceData;
    const message = invoiceEmail(invoice, { logoUrl: `${this.config.publicUrl}/brand/logo.png` });
    await this.mailer.send({ to: customer.email, ...message });
    await this.db.update(bookings).set({ invoiceSentAt: new Date(), invoiceSentTo: customer.email }).where(eq(bookings.id, bookingId));
    this.log.info({ bookingId, to: customer.email }, "invoice emailed");
    return { sent: true, to: customer.email };
  }

  private async release(bookingId: string) {
    await this.db.update(bookings).set({ invoiceSentAt: null }).where(eq(bookings.id, bookingId));
  }
}
