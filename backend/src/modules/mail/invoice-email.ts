import type { MailMessage } from "./mailer.js";

export interface InvoiceData {
  invoiceNumber: string;
  issuedAt: string;
  bookingReference: string;
  seller: { name: string; trn: string | null; address: string; phone: string; email: string };
  customer: { name: string | null; phone: string | null; email: string | null; address: string };
  lines: { description: string; serviceDate: string | null; amountAed: number }[];
  vatRate: number;
  subtotalAed: number;
  vatAed: number;
  totalAed: number;
  refundedAed: number;
  payment: { method: string; paidAt: string | null } | null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dubai" });

/** Branded tax-invoice email (HTML with a plain-text part), built from the invoice endpoint's data. */
export function invoiceEmail(inv: InvoiceData, opts: { logoUrl: string }): Omit<MailMessage, "to"> {
  const first = inv.customer.name?.split(" ")[0] ?? "there";
  const vatPct = `${Math.round(inv.vatRate * 100)}%`;
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:6px 0;color:${strong ? "#16130E" : "#6F685C"};font-weight:${strong ? 800 : 500};font-size:${strong ? 17 : 14}px">${label}</td><td align="right" style="padding:6px 0;color:#16130E;font-weight:${strong ? 800 : 600};font-size:${strong ? 17 : 14}px">${value}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#F6F4EF;font-family:Helvetica,Arial,sans-serif;color:#24201A">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4EF;padding:24px 12px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #ECE6DA">
  <tr><td style="background:#16130E;padding:26px 28px">
    <table width="100%"><tr>
      <td><img src="${esc(opts.logoUrl)}" width="72" alt="Xtreme" style="display:block;border:0" /></td>
      <td align="right" style="color:#E2C170;font-weight:800;font-size:20px;letter-spacing:1px">TAX INVOICE<div style="color:#BDB4A3;font-weight:500;font-size:13px;letter-spacing:0">${esc(inv.invoiceNumber)}</div></td>
    </tr></table>
    <div style="margin-top:16px;color:#ffffff;font-weight:700;font-size:15px">${esc(inv.seller.name)}</div>
    <div style="color:#BDB4A3;font-size:12.5px;line-height:18px">${esc(inv.seller.address)}<br/>${esc(inv.seller.phone)} · ${esc(inv.seller.email)}${inv.seller.trn ? `<br/>TRN ${esc(inv.seller.trn)}` : ""}</div>
  </td></tr>
  <tr><td style="padding:26px 28px 6px">
    <p style="margin:0 0 6px;font-size:16px">Hi ${esc(first)},</p>
    <p style="margin:0;color:#6F685C;font-size:14px;line-height:21px">Thank you for choosing Xtreme. Your service is complete and here is your tax invoice for booking <b style="color:#16130E">${esc(inv.bookingReference)}</b>.</p>
  </td></tr>
  <tr><td style="padding:16px 28px">
    <table width="100%" style="font-size:13px"><tr>
      <td valign="top"><div style="color:#A39B8C;font-weight:700;letter-spacing:.6px;font-size:11px">BILLED TO</div><div style="font-weight:700;margin-top:4px">${esc(inv.customer.name ?? "Customer")}</div><div style="color:#6F685C">${esc([inv.customer.phone, inv.customer.email].filter(Boolean).join(" · "))}<br/>${esc(inv.customer.address)}</div></td>
      <td valign="top" align="right"><div style="color:#A39B8C;font-weight:700;letter-spacing:.6px;font-size:11px">DATE</div><div style="font-weight:700;margin-top:4px">${day(inv.issuedAt)}</div></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:0 28px">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ECE6DA;border-radius:12px;overflow:hidden">
      <tr style="background:#FBF7EC"><td style="padding:10px 14px;color:#A39B8C;font-weight:700;font-size:11px;letter-spacing:.6px">DESCRIPTION</td><td align="right" style="padding:10px 14px;color:#A39B8C;font-weight:700;font-size:11px;letter-spacing:.6px">AMOUNT</td></tr>
      ${inv.lines
        .map(
          (l) =>
            `<tr><td style="padding:12px 14px;border-top:1px solid #F1ECE2"><div style="font-weight:700;font-size:14px">${esc(l.description)}</div>${l.serviceDate ? `<div style="color:#6F685C;font-size:12.5px">Service date ${day(l.serviceDate)}</div>` : ""}</td><td align="right" style="padding:12px 14px;border-top:1px solid #F1ECE2;font-weight:700;font-size:14px">${money(l.amountAed)}</td></tr>`,
        )
        .join("")}
    </table>
  </td></tr>
  <tr><td style="padding:14px 28px 0">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${row("Subtotal (excl. VAT)", money(inv.subtotalAed))}
      ${row(`VAT ${vatPct}`, money(inv.vatAed))}
      <tr><td colspan="2" style="border-top:1px solid #ECE6DA;padding-top:4px"></td></tr>
      ${row("Total (incl. VAT)", money(inv.totalAed), true)}
      ${inv.refundedAed > 0 ? row("Refunded", `− ${money(inv.refundedAed)}`) : ""}
    </table>
  </td></tr>
  ${
    inv.payment
      ? `<tr><td style="padding:14px 28px 0"><div style="background:#E6F6EC;color:#1E9E5A;border-radius:10px;padding:12px 14px;font-weight:700;font-size:14px">Paid by ${esc(inv.payment.method)}${inv.payment.paidAt ? ` on ${day(inv.payment.paidAt)}` : ""}</div></td></tr>`
      : ""
  }
  <tr><td style="padding:22px 28px 26px;color:#6F685C;font-size:12.5px;line-height:19px">
    Questions about this invoice? Reply to this email or WhatsApp us on ${esc(inv.seller.phone)}.<br/>
    No gateway fees or hidden charges. You can also find this invoice in the Xtreme-Cleaning Partner app under the booking.
  </td></tr>
  <tr><td style="background:#16130E;padding:16px 28px;color:#A79E8D;font-size:12px" align="center"><span style="color:#E2C170;font-weight:700">Xtreme</span>-Cleaning Partner · ${esc(inv.seller.name)}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `${inv.seller.name}: Tax invoice ${inv.invoiceNumber}`,
    inv.seller.trn ? `TRN ${inv.seller.trn}` : null,
    `Booking ${inv.bookingReference} · ${day(inv.issuedAt)}`,
    "",
    ...inv.lines.map((l) => `${l.description}: ${money(l.amountAed)}`),
    "",
    `Subtotal (excl. VAT): ${money(inv.subtotalAed)}`,
    `VAT ${vatPct}: ${money(inv.vatAed)}`,
    `Total (incl. VAT): ${money(inv.totalAed)}`,
    inv.payment ? `Paid by ${inv.payment.method}` : null,
    "",
    `Thank you for choosing Xtreme. ${inv.seller.phone} · ${inv.seller.email}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { subject: `Your Xtreme invoice ${inv.invoiceNumber} for ${inv.bookingReference}`, html, text };
}
