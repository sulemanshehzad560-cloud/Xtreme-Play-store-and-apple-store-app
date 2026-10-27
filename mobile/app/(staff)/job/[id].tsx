import { useState } from "react";
import { Alert, Linking, Platform, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Button, Card, Divider, ErrorText, InlineLoader, Input, Row, Screen, StatusPill, StickyFooter, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { aed, SIZE_LABEL, when } from "@/lib/format";
import { fonts } from "@/lib/theme";
import type { Booking, BookingStatus } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** The lead can quote on site once the team is on the way. */
const CAN_QUOTE: BookingStatus[] = ["en_route", "arrived", "in_progress"];

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
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Text variant="heading" style={{ flex: 1 }}>
            {job.service.name}
          </Text>
          <StatusPill status={job.status} />
        </Row>
        <Text variant="small">
          {job.reference} · {when(job.scheduledAt)}
        </Text>
      </Card>
      <Card>
        <Text variant="label">CUSTOMER</Text>
        <Text style={{ fontFamily: fonts.bold }}>{job.customer?.fullName ?? "Customer"}</Text>
        {job.customer?.phone ? <Button title={`📞  Call ${job.customer.phone}`} variant="secondary" size="sm" onPress={() => Linking.openURL(`tel:${job.customer!.phone}`)} /> : null}
      </Card>
      <Card>
        <Text variant="label">ADDRESS</Text>
        <Text style={{ fontFamily: fonts.semibold }}>{[job.address.unit, job.address.building, job.address.area].filter(Boolean).join(", ")}</Text>
        <Text variant="small">
          {job.property.type} · {SIZE_LABEL[job.property.size] ?? job.property.size}
        </Text>
        {job.notes ? <Text variant="small">Notes: {job.notes}</Text> : null}
        <Button title="🧭  Navigate" variant="secondary" size="sm" onPress={navigate} />
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
          {job.paymentStatus === "paid"
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
