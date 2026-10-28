import { useMemo, useState } from "react";
import { Modal, ScrollView } from "react-native";
import { SuccessBurst } from "@/components/art/Motion";
import { ServiceIcon } from "@/components/art/ServiceIcon";
import { Alert, Linking, Pressable, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Avatar, Button, Card, Chip, Divider, InlineLoader, Notice, Row, Screen, StatusPill, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { aed, SIZE_LABEL, STAFF_LABEL, when } from "@/lib/format";
import { useBookingEvents } from "@/lib/realtime";
import { colors, fonts, radius, space } from "@/lib/theme";
import type { Booking, BookingStatus, Company } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { LineIcon, iconColor } from "@/components/LineIcon";

const FLOW: [BookingStatus, string][] = [
  ["requested", "Booking received"],
  ["confirmed", "Confirmed"],
  ["assigned", "Team assigned"],
  ["en_route", "On the way"],
  ["arrived", "Arrived"],
  ["in_progress", "Cleaning in progress"],
  ["completed", "Completed"],
];

const PAYMENT_LABEL: Record<Booking["paymentStatus"], string> = {
  unpaid: "Not paid yet",
  pending: "Payment in progress",
  paid: "Paid",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
  included: "Included in your subscription",
};

export default function BookingDetail() {
  const { id, new: isNew, paid } = useLocalSearchParams<{ id: string; new?: string; paid?: string }>();
  const { data: b, reload } = useApi<Booking>(`/bookings/${id}`);
  const company = useApi<Company>("/company");
  const [rating, setRating] = useState(0);
  const [rescheduling, setRescheduling] = useState(false);
  useBookingEvents(id, { "booking:status": () => void reload() });

  if (!b) {
    return (
      <Screen edges={["left", "right"]}>
        <InlineLoader label="Fetching your booking…" />
      </Screen>
    );
  }

  const reached = FLOW.findIndex(([s]) => s === b.status);
  const lead = b.team.find((m) => m.isLead) ?? b.team[0];

  const cancel = () =>
    Alert.alert("Cancel this booking?", b.paymentStatus === "paid" ? "You'll get a full refund to your original payment method." : "You can book again any time.", [
      { text: "Keep booking", style: "cancel" },
      {
        text: "Cancel booking",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/bookings/${b.id}/cancel`, { body: {} });
            await reload();
          } catch (e) {
            Alert.alert("Could not cancel", e instanceof Error ? e.message : "");
          }
        },
      },
    ]);

  return (
    <Screen edges={["left", "right"]}>
      {paid || (isNew && !b.awaitingPayment) ? (
        <Card tone="gold" style={{ alignItems: "center", paddingVertical: space(5) }}>
          <SuccessBurst size={120} />
          <Text variant="title" style={{ fontSize: 22, textAlign: "center" }}>
            {paid ? "Payment successful!" : b.status === "confirmed" ? "Booking confirmed!" : "Booking received!"}
          </Text>
          <Text variant="muted" style={{ textAlign: "center" }}>
            {b.reference} · {when(b.scheduledAt)}
            {"\n"}
            {paid ? "Your booking is confirmed. We'll notify you at every step." : "We'll notify you at every step."}
          </Text>
        </Card>
      ) : null}

      {b.awaitingPayment && b.canPay && !paid ? (
        <Card tone="ink" style={{ gap: space(2.5) }}>
          <Row style={{ gap: space(2) }}>
            <LineIcon name="clock" size={22} color={colors.goldBright} />
            <Text style={{ color: colors.goldBright, fontFamily: fonts.extrabold, fontSize: 17, flex: 1 }}>Complete payment to confirm</Text>
          </Row>
          <Text style={{ color: "#D9D2C4", lineHeight: 20 }}>
            Once you pay, your booking is confirmed and we assign your team.
          </Text>
          {b.discountAed ? (
            <Text style={{ color: colors.goldBright, fontFamily: fonts.bold }}>{aed(b.discountAed)} discount applied</Text>
          ) : null}
          <Button title={`Pay ${aed(b.amountDueAed ?? b.priceAed)} securely`} variant="gold" onPress={() => router.push(`/booking/${b.id}/pay`)} />
        </Card>
      ) : null}

      <Card>
        <Row style={{ alignItems: "flex-start" }}>
          <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
            <ServiceIcon name={b.service.key} size={44} tile={false} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="heading">{b.service.name}</Text>
            <Text variant="small">
              {when(b.scheduledAt)} · {b.reference}
            </Text>
            <StatusPill status={b.status} awaitingPayment={b.awaitingPayment} />
          </View>
        </Row>
        {b.trackable ? <Button title="Track your team live" icon={<LineIcon name="map" size={18} color={colors.onPrimary} />} onPress={() => router.push(`/booking/${b.id}/track`)} /> : null}
      </Card>

      {b.status !== "cancelled" ? (
        <Card>
          <Text variant="heading">Status</Text>
          {FLOW.map(([s, label], i) => {
            const done = i <= reached;
            const current = i === reached;
            return (
              <Row key={s} style={{ alignItems: "flex-start", gap: space(3) }}>
                <View style={{ alignItems: "center", width: 22 }}>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: done ? (current ? colors.gold : colors.ink) : colors.surface,
                      borderWidth: 2,
                      borderColor: done ? (current ? colors.gold : colors.ink) : colors.border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {done && !current ? <RNText style={{ color: "#fff", fontSize: 11, fontFamily: fonts.bold }}>✓</RNText> : null}
                  </View>
                  {i < FLOW.length - 1 ? <View style={{ width: 2, height: 18, backgroundColor: i < reached ? colors.ink : colors.border }} /> : null}
                </View>
                <Text style={{ fontFamily: current ? fonts.bold : fonts.medium, color: done ? colors.text : colors.faint, fontSize: 15 }}>{label}</Text>
              </Row>
            );
          })}
        </Card>
      ) : (
        <Notice>This booking was cancelled{b.paymentStatus === "refunded" ? " and your payment was refunded" : ""}.</Notice>
      )}

      {lead ? (
        <Card>
          <Text variant="heading">Your professional</Text>
          <Row>
            <Avatar name={lead.displayName} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bold }}>{lead.displayName}</Text>
              <Text variant="small">
                {lead.teamName ? `${lead.teamName} · ` : ""}
                {STAFF_LABEL[lead.status]}
                {b.team.length > 1 ? ` · +${b.team.length - 1} team member` : ""}
              </Text>
            </View>
          </Row>
          {company.data ? (
            <Row style={{ gap: space(2) }}>
              <Button title="Call" icon={<LineIcon name="call" size={18} color={iconColor("call")} />} variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${company.data!.phone}`)} />
              <Button title="WhatsApp" icon={<LineIcon name="chat" size={18} color={iconColor("chat")} />} variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => Linking.openURL(company.data!.whatsapp)} />
            </Row>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Text variant="heading">Details</Text>
        <Detail label="Property" value={`${b.property.type[0]!.toUpperCase()}${b.property.type.slice(1)} · ${SIZE_LABEL[b.property.size] ?? b.property.size}`} />
        <Detail label="Address" value={[b.address.unit, b.address.building, b.address.area].filter(Boolean).join(", ")} />
        {b.frequency && b.frequency !== "one_time" ? (
          <Detail label="Repeats" value={`${b.frequency === "weekly" ? "Every week" : "Every two weeks"} · the next visit is set up after this one. Cancel a visit to stop repeating.`} />
        ) : null}
        <Detail label="Cleaning materials" value="Included free" />
        {b.notes ? <Detail label="Notes" value={b.notes} /> : null}
        <Divider />
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <Text variant="small">Payment</Text>
            <Text style={{ fontFamily: fonts.semibold, color: b.paymentStatus === "paid" || b.paymentStatus === "included" ? colors.success : colors.text }}>{PAYMENT_LABEL[b.paymentStatus]}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            {b.discountAed ? <Text variant="small" style={{ textDecorationLine: "line-through" }}>{aed(b.priceAed)}</Text> : null}
            <Text variant="price">{b.paymentStatus === "included" ? "Included" : aed(b.amountDueAed ?? b.priceAed)}</Text>
          </View>
        </Row>
        {b.discountAed ? (
          <Text variant="small" style={{ color: colors.success, fontFamily: fonts.semibold }}>
            Discount {aed(b.discountAed)}{b.promoCode ? ` · code ${b.promoCode}` : ""}
          </Text>
        ) : null}
        {b.priceAed == null && b.status !== "cancelled" ? (
          <Text variant="small">Our team inspects on arrival and sends your quote here. You'll get a notification and can pay securely in the app.</Text>
        ) : null}
        {b.canPay && !b.awaitingPayment ? <Button title={`Pay ${aed(b.amountDueAed ?? b.priceAed)} now`} variant="gold" onPress={() => router.push(`/booking/${b.id}/pay`)} /> : null}
        {["paid", "partially_refunded", "refunded"].includes(b.paymentStatus) ? (
          <Button title="View tax invoice" variant="secondary" onPress={() => router.push(`/booking/${b.id}/invoice`)} />
        ) : null}
      </Card>

      {b.status === "completed" && !b.review ? (
        <Card tone="gold">
          <Text variant="heading">How was your service?</Text>
          <Row style={{ justifyContent: "center", gap: space(2) }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} accessibilityLabel={`${n} stars`}>
                <RNText style={{ fontSize: 38, color: n <= rating ? colors.star : colors.border }}>★</RNText>
              </Pressable>
            ))}
          </Row>
          <Button
            title="Submit rating"
            disabled={!rating}
            onPress={async () => {
              await api(`/bookings/${b.id}/review`, { body: { rating } });
              await reload();
            }}
          />
        </Card>
      ) : null}
      {b.review ? <Text variant="small" style={{ textAlign: "center" }}>You rated this service {"★".repeat(b.review.rating)}</Text> : null}

      {b.status === "completed" || b.status === "cancelled" ? <Button title="Book again" onPress={() => router.push(`/service/${b.service.key}`)} /> : null}
      {b.canReschedule ? <Button title="Reschedule" icon={<LineIcon name="calendar" size={18} color={iconColor("calendar")} />} variant="secondary" onPress={() => setRescheduling(true)} /> : null}
      {b.canCancel ? <Button title="Cancel booking" variant="danger" onPress={cancel} /> : null}
      <RescheduleSheet
        visible={rescheduling}
        onClose={() => setRescheduling(false)}
        onPick={async (iso) => {
          try {
            await api(`/bookings/${b.id}`, { method: "PATCH", body: { scheduledAt: iso } });
            setRescheduling(false);
            await reload();
            Alert.alert("Rescheduled", "Your new time is confirmed.");
          } catch (e) {
            Alert.alert("Could not reschedule", e instanceof Error ? e.message : "");
          }
        }}
      />
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="small">{label}</Text>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 15 }}>{value}</Text>
    </View>
  );
}

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;

/** Bottom sheet to pick a new day and start time (Abu Dhabi time). */
function RescheduleSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (iso: string) => Promise<void> }) {
  const days = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i + 1);
        return d;
      }),
    [],
  );
  const [day, setDay] = useState(days[0]!);
  const [hour, setHour] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={onClose} />
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space(5), gap: space(3), paddingBottom: space(10) }}>
        <Text variant="heading">Pick a new time</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
          {days.map((d) => (
            <View key={d.toDateString()} style={{ width: 62 }}>
              <Chip label={String(d.getDate())} sub={d.toLocaleDateString("en-GB", { weekday: "short" })} selected={d.toDateString() === day.toDateString()} onPress={() => setDay(d)} />
            </View>
          ))}
        </ScrollView>
        <Row style={{ flexWrap: "wrap", gap: space(2) }}>
          {HOURS.map((h) => (
            <View key={h} style={{ width: "31%" }}>
              <Chip label={hourLabel(h)} selected={hour === h} onPress={() => setHour(h)} />
            </View>
          ))}
        </Row>
        <Button
          title="Confirm new time"
          disabled={hour == null}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await onPick(new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour! - 4)).toISOString());
            setBusy(false);
          }}
        />
      </View>
    </Modal>
  );
}
