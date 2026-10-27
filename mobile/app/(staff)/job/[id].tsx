import { useState } from "react";
import { Alert, Linking, Platform, Text as RNText, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Button, Card, Divider, ErrorText, InlineLoader, Input, Row, Screen, StatusPill, StickyFooter, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { aed, SIZE_LABEL, when } from "@/lib/format";
import { LineIcon } from "@/components/LineIcon";
import { colors, fonts, space } from "@/lib/theme";
import type { Booking, BookingStatus } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** The lead can quote on site once the team is on the way. */
const CAN_QUOTE: BookingStatus[] = ["en_route", "arrived", "in_progress"];

const FLOW: BookingStatus[] = ["assigned", "en_route", "arrived", "in_progress", "completed"];

const NEXT: Partial<Record<BookingStatus, { to: BookingStatus; label: string }>> = {
  assigned: { to: "en_route", label: "Start driving" },
  en_route: { to: "arrived", label: "I've arrived" },
  arrived: { to: "in_progress", label: "Start the job" },
  in_progress: { to: "completed", label: "Mark as completed" },
};

export default function Job() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, setData } = useApi<Booking>(`/bookings/${id}`);
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  if (!job) {
    return (
      <Screen edges={["left", "right"]}>
        <InlineLoader label="Loading the job…" />
      </Screen>
    );
  }

  const next = NEXT[job.status];
  const { lat, lng } = job.address;
  const navigate = () =>
    Linking.openURL(Platform.OS === "ios" ? `maps://?daddr=${lat},${lng}` : `google.navigation:q=${lat},${lng}`).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`),
    );

  const isLead = job.team.some((m) => m.id === user?.id && m.isLead);
  const unpaid = job.paymentStatus === "unpaid" || job.paymentStatus === "pending";
  const showQuote = isLead && unpaid && CAN_QUOTE.includes(job.status) && (job.pricing === "inspection" || job.priceAed == null);
  const needsQuote = job.priceAed == null;

  async function sendQuote() {
    const amount = Number(price.replace(/[^0-9]/g, ""));
    if (!amount) return setQuoteError("Enter the price in AED");
    setQuoting(true);
    setQuoteError(null);
    try {
      setData(await api<Booking>(`/staff/jobs/${job!.id}/quote`, { body: { priceAed: amount, ...(note.trim() ? { note: note.trim() } : {}) } }));
      setPrice("");
      setNote("");
      Alert.alert("Quote sent", `The customer can now see AED ${amount} and pay in the app.`);
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : "Could not send the quote");
    } finally {
      setQuoting(false);
    }
  }

  async function advance() {
    if (!next) return;
    setBusy(true);
    try {
      setData(await api<Booking>(`/staff/jobs/${job!.id}/status`, { body: { status: next.to } }));
    } catch (e) {
      Alert.alert("Could not update", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      edges={["left", "right"]}
      footer={
        next ? (
          <StickyFooter>
            <Button title={next.label} onPress={advance} loading={busy} disabled={next.to === "completed" && needsQuote} style={{ flex: 1 }} />
          </StickyFooter>
        ) : undefined
      }
    >
      <Card tone="ink">
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1, gap: 2 }}>
            <RNText style={{ color: colors.goldBright, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1 }}>{job.reference}</RNText>
            <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 22 }}>{job.service.name}</RNText>
            <RNText style={{ color: "#CFC8BA", fontFamily: fonts.medium, fontSize: 13 }}>{when(job.scheduledAt)}</RNText>
          </View>
          <StatusPill status={job.status} />
        </Row>
        <Row style={{ gap: 4 }}>
          {FLOW.map((st, i) => (
            <View key={st} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= FLOW.indexOf(job.status) ? colors.goldBright : "#3A3326" }} />
          ))}
        </Row>
        <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 12 }}>
          {job.property.type} · {SIZE_LABEL[job.property.size] ?? job.property.size}
          {job.team.length > 1 ? ` · team of ${job.team.length}` : ""}
        </RNText>
      </Card>
      <Card>
        <Text variant="label">CUSTOMER</Text>
        <Text style={{ fontFamily: fonts.bold, fontSize: 17 }}>{job.customer?.fullName ?? "Customer"}</Text>
        {job.customer?.phone ? (
          <Row style={{ gap: space(2) }}>
            <Button title="Call" icon={<LineIcon name="call" size={18} />} variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${job.customer!.phone}`)} />
            <Button title="WhatsApp" icon={<LineIcon name="chat" size={18} />} variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => Linking.openURL(`https://wa.me/${job.customer!.phone!.replace(/[^0-9]/g, "")}`)} />
          </Row>
        ) : null}
      </Card>
      <Card>
        <Text variant="label">ADDRESS</Text>
        <Row style={{ alignItems: "flex-start", gap: space(2) }}>
          <LineIcon name="pin" size={20} color={colors.gold} />
          <Text style={{ fontFamily: fonts.semibold, flex: 1 }}>{[job.address.unit, job.address.building, job.address.area].filter(Boolean).join(", ")}</Text>
        </Row>
        {job.notes ? <Text variant="small">Notes: {job.notes}</Text> : null}
        <Button title="Navigate" icon={<LineIcon name="globe" size={18} />} variant="secondary" size="sm" onPress={navigate} />
      </Card>
      {showQuote ? (
        <Card tone="gold">
          <Text variant="label">{needsQuote ? "QUOTE THE PRICE" : "UPDATE THE QUOTE"}</Text>
          <Text variant="small">
            {needsQuote
              ? "Inspect the job, agree the price with the customer and send it. They get it at once in the app and can pay securely online."
              : `Current quote: ${aed(job.priceAed)}. Change it only if the customer agreed to a new price.`}
          </Text>
          <Input label="Price (AED, incl. VAT)" value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="e.g. 250" />
          <Input label="What it covers (optional)" value={note} onChangeText={setNote} placeholder="e.g. 3-seater sofa and 2 chairs" maxLength={200} />
          <ErrorText error={quoteError} />
          <Button title={needsQuote ? "Send quote to customer" : "Send new quote"} onPress={sendQuote} loading={quoting} />
        </Card>
      ) : null}
      <Card>
        <Text variant="label">PAYMENT</Text>
        <Divider />
        <Text style={{ fontFamily: fonts.semibold }}>
          {job.paymentStatus === "included"
            ? "Included in the customer's subscription"
            : job.paymentStatus === "paid"
            ? `✅ Paid in the app · ${aed(job.priceAed)}`
            : job.priceAed == null
              ? "Price to be quoted on site"
              : `${aed(job.priceAed)} · customer pays securely in the app`}
        </Text>
        {needsQuote && next?.to === "completed" ? <Text variant="small">Send the quote before marking the job completed.</Text> : null}
      </Card>
      <View />
    </Screen>
  );
}
