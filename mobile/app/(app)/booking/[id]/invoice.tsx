import { useState } from "react";
import { Image, Share, Text as RNText, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Button, Divider, ErrorText, InlineLoader, Row, Screen, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { aed } from "@/lib/format";
import { colors, fonts, radius, shadow, space } from "@/lib/theme";
import { useApi } from "@/lib/useApi";

interface Invoice {
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

const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const money = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Receipt for a paid booking. The VAT tax invoice itself is only sent by email. */
export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const inv = useApi<Invoice>(`/bookings/${id}/invoice`);
  const i = inv.data;
  const [mail, setMail] = useState<{ busy: boolean; note: string | null; ok: boolean }>({ busy: false, note: null, ok: true });

  async function emailInvoice() {
    setMail({ busy: true, note: null, ok: true });
    try {
      await api(`/bookings/${id}/invoice/email`, { method: "POST" });
      setMail({ busy: false, note: i?.customer.email ? `Sent to ${i.customer.email}` : "Tax invoice sent to your email", ok: true });
    } catch (e) {
      setMail({ busy: false, note: (e as Error).message, ok: false });
    }
  }

  async function share() {
    if (!i) return;
    await Share.share({
      message:
        `${i.seller.name}: Receipt ${i.invoiceNumber}\n` +
        `Booking ${i.bookingReference} · ${date(i.issuedAt)}\n` +
        i.lines.map((l) => `${l.description}: ${money(l.amountAed)}`).join("\n") +
        `\nTotal paid ${money(i.totalAed)}`,
    });
  }

  return (
    <Screen edges={["left", "right"]} footer={
        i ? (
          <View style={{ padding: space(4), paddingTop: 0, gap: space(2) }}>
            <Button title={i.customer.email ? "Email me the tax invoice" : "Add your email to get the tax invoice"} onPress={emailInvoice} loading={mail.busy} disabled={!i.customer.email} />
            <Button title="Share receipt" variant="secondary" onPress={share} />
          </View>
        ) : undefined
      }>
      {inv.loading ? <InlineLoader label="Preparing your receipt…" /> : null}
      <ErrorText error={inv.error} />
      {i ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, overflow: "hidden", ...shadow.raised }}>
          <View style={{ backgroundColor: colors.ink, padding: space(5), gap: space(3) }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Image source={require("../../../../assets/logo-mark.png")} style={{ width: 62, height: 48 }} resizeMode="contain" />
              <View style={{ alignItems: "flex-end" }}>
                <RNText style={{ color: colors.goldBright, fontFamily: fonts.extrabold, fontSize: 20, letterSpacing: 1 }}>RECEIPT</RNText>
                <RNText style={{ color: "#BDB4A3", fontFamily: fonts.medium, fontSize: 13 }}>{i.invoiceNumber}</RNText>
              </View>
            </Row>
            <View>
              <RNText style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 15 }}>{i.seller.name}</RNText>
              <RNText style={{ color: "#BDB4A3", fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18 }}>
                {i.seller.address}
                {"\n"}
                {i.seller.phone} · {i.seller.email}
              </RNText>
            </View>
          </View>

          <View style={{ padding: space(5), gap: space(4) }}>
            <Row style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label">BILLED TO</Text>
                <Text style={{ fontFamily: fonts.semibold }}>{i.customer.name ?? "Customer"}</Text>
                {i.customer.phone ? <Text variant="small">{i.customer.phone}</Text> : null}
                {i.customer.email ? <Text variant="small">{i.customer.email}</Text> : null}
                <Text variant="small">{i.customer.address}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text variant="label">DATE</Text>
                <Text style={{ fontFamily: fonts.semibold }}>{date(i.issuedAt)}</Text>
                <Text variant="small">Booking {i.bookingReference}</Text>
              </View>
            </Row>

            <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
              <Row style={{ backgroundColor: colors.surfaceAlt, paddingHorizontal: space(3), paddingVertical: space(2), justifyContent: "space-between" }}>
                <Text variant="label">DESCRIPTION</Text>
                <Text variant="label">AMOUNT</Text>
              </Row>
              {i.lines.map((l) => (
                <Row key={l.description} style={{ paddingHorizontal: space(3), paddingVertical: space(3), justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fonts.semibold }}>{l.description}</Text>
                    {l.serviceDate ? <Text variant="small">Service date {date(l.serviceDate)}</Text> : null}
                  </View>
                  <Text style={{ fontFamily: fonts.semibold }}>{money(l.amountAed)}</Text>
                </Row>
              ))}
            </View>

            <View style={{ gap: space(1.5) }}>
              <Divider />
              <Line label="Total paid" value={money(i.totalAed)} strong />
              {i.refundedAed > 0 ? <Line label="Refunded" value={`− ${money(i.refundedAed)}`} /> : null}
            </View>

            {i.payment ? (
              <View style={{ backgroundColor: colors.successSoft, borderRadius: radius.md, padding: space(3) }}>
                <Text style={{ color: colors.success, fontFamily: fonts.semibold }}>
                  Paid by {i.payment.method}
                  {i.payment.paidAt ? ` on ${date(i.payment.paidAt)}` : ""}
                </Text>
              </View>
            ) : null}
            {mail.note ? <Text style={{ textAlign: "center", color: mail.ok ? colors.success : colors.danger, fontFamily: fonts.semibold }}>{mail.note}</Text> : null}
            <Text variant="small" style={{ textAlign: "center" }}>
              Thank you for choosing Xtreme. {aed(i.totalAed)} paid with no hidden charges. Your official tax invoice is sent to your email.
            </Text>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <Text style={strong ? { fontFamily: fonts.extrabold, fontSize: 17 } : { color: colors.muted }}>{label}</Text>
      <Text style={strong ? { fontFamily: fonts.extrabold, fontSize: 17 } : { fontFamily: fonts.semibold }}>{value}</Text>
    </Row>
  );
}
