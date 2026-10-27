import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Text as RNText, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { Button, Card, Chip, Divider, ErrorText, InlineLoader, Input, OptionCard, Row, Screen, StepBar, StickyFooter, Text } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { aed, SIZE_LABEL } from "@/lib/format";
import { ratingLabel } from "@/lib/rating";
import { ServiceIcon } from "@/components/art/ServiceIcon";
import { AddressPicker, completeAddress, type NewAddress } from "@/components/AddressPicker";
import { colors, fonts, radius, space } from "@/lib/theme";
import type { Booking, Service } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { TamaraBadge } from "@/components/BrandIcons";
import { SlotPicker, abuDhabiTime, hourLabel, nextDays } from "@/components/SlotPicker";

type PropertyType = "apartment" | "villa" | "office";
type Pay = "card" | "tamara";
interface Catalog {
  services: Service[];
  propertySizes: Record<PropertyType, { key: string; label: string }[]>;
}
interface Address {
  id: string;
  label: string;
  area: string;
  building: string | null;
  unit: string | null;
  lat: number;
  lng: number;
  isDefault: boolean;
}

const STEPS = ["Service details", "Date & time", "Address", "Review & pay"];
const PROPERTY: [PropertyType, string, string][] = [
  ["apartment", "Apartment", "🏢"],
  ["villa", "Villa", "🏡"],
  ["office", "Office", "🏬"],
];

export default function BookService() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const catalog = useApi<Catalog>("/catalog/services");
  const saved = useApi<Address[]>("/me/addresses");
  const service = catalog.data?.services.find((s) => s.key === key);

  const [step, setStep] = useState(0);
  const [type, setType] = useState<PropertyType>("apartment");
  const [size, setSize] = useState("2bhk");
  const [plan, setPlan] = useState<"one_off" | "amc">("one_off");
  const days = useMemo(() => nextDays(14), []);
  const [day, setDay] = useState(days[0]!);
  const [hour, setHour] = useState<number | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Partial<NewAddress>>({ label: "Home" });
  const [notes, setNotes] = useState("");
  const [pay, setPay] = useState<Pay>("card");
  const [price, setPrice] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(Crypto.randomUUID()).current;

  const sizes = catalog.data?.propertySizes[type] ?? [];
  const fixed = service?.pricing.kind === "tiered";

  useEffect(() => {
    if (sizes.length && !sizes.some((s) => s.key === size)) setSize(sizes[Math.min(1, sizes.length - 1)]!.key);
  }, [type, sizes.length]);

  useEffect(() => {
    if (!saved.data) return;
    const def = saved.data.find((a) => a.isDefault) ?? saved.data[0];
    if (def && !addressId) setAddressId(def.id);
    if (saved.data.length === 0) setAdding(true);
  }, [saved.data]);

  useEffect(() => {
    if (!service) return;
    api<{ priceAed: number | null }>(`/catalog/quote?serviceKey=${service.key}&propertyType=${type}&propertySize=${size}&plan=${plan}`)
      .then((q) => setPrice(q.priceAed))
      .catch(() => setPrice(undefined));
  }, [service?.key, type, size, plan]);

  const newAddressOk = Boolean(completeAddress(draft));
  const canContinue = [true, hour != null, adding ? newAddressOk : Boolean(addressId), true][step];

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const newAddress = completeAddress(draft)!;
      let useId = adding ? null : addressId;
      if (adding) {
        const created = await api<Address>("/me/addresses", { body: newAddress }).catch(() => null);
        useId = created?.id ?? null;
      }
      const booking = await api<Booking>("/bookings", {
        headers: { "Idempotency-Key": idempotencyKey },
        body: {
          serviceKey: key,
          propertyType: type,
          propertySize: size,
          plan,
          scheduledAt: abuDhabiTime(day, hour!),
          notes: notes.trim() || undefined,
          // Survey-priced services are paid in the app once the price is set.
          paymentMethod: fixed ? pay : "card",
          ...(useId ? { addressId: useId } : { address: newAddress }),
        },
      });
      if (booking.canPay && (pay === "card" || pay === "tamara")) router.replace(`/booking/${booking.id}/pay?method=${pay}`);
      else router.replace(`/booking/${booking.id}?new=1`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "phone_required") {
        router.push("/phone");
        setError("Add your mobile number, then tap Confirm again.");
      } else setError(e instanceof Error ? e.message : "Could not book");
    } finally {
      setBusy(false);
    }
  }

  if (!service) {
    return (
      <Screen edges={["left", "right"]}>
        <InlineLoader label="Preparing your booking…" />
      </Screen>
    );
  }

  const selectedAddress = saved.data?.find((a) => a.id === addressId);
  const totalLabel = fixed ? (price != null ? aed(price) : "…") : "On quote";
  const cta = step < 3 ? "Continue" : fixed && price != null ? `Pay ${aed(price)}` : "Confirm booking";

  return (
    <Screen
      edges={["left", "right"]}
      footer={
        <StickyFooter>
          <View style={{ flex: 1 }}>
            <Text variant="small">{fixed ? "Total" : "Price"}</Text>
            <Text variant="price">{totalLabel}</Text>
          </View>
          <Button title={cta} onPress={() => (step < 3 ? setStep(step + 1) : submit())} disabled={!canContinue} loading={busy} style={{ flex: 1.3 }} />
        </StickyFooter>
      }
    >
      <Stack.Screen
        options={{
          title: service.name,
          headerLeft:
            step > 0
              ? () => (
                  <Text onPress={() => setStep(step - 1)} style={{ fontSize: 30, paddingRight: space(3) }} accessibilityLabel="Previous step">
                    ‹
                  </Text>
                )
              : undefined,
        }}
      />
      <StepBar steps={STEPS} current={step} />

      {step === 0 ? (
        <>
          <Card tone="gold">
            <Row>
              <View style={{ width: 60, height: 60, borderRadius: radius.lg, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
                <ServiceIcon name={service.key} size={52} tile={false} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="heading">{service.name}</Text>
                <Text variant="small">
                  {ratingLabel(service)} · approx. {Math.max(1, Math.round(service.durationMinutes / 60))} hours
                </Text>
              </View>
            </Row>
            <Divider />
            {service.highlights.map((h) => (
              <Row key={h} style={{ gap: space(2) }}>
                <RNText style={{ color: colors.success, fontSize: 15 }}>✓</RNText>
                <Text style={{ fontSize: 14, flex: 1 }}>{h}</Text>
              </Row>
            ))}
          </Card>

          <Text variant="heading">Property type</Text>
          <Row style={{ gap: space(2) }}>
            {PROPERTY.map(([t, label, icon]) => (
              <View key={t} style={{ flex: 1 }}>
                <Chip icon={icon} label={label} selected={type === t} onPress={() => setType(t)} />
              </View>
            ))}
          </Row>

          <Text variant="heading">Size</Text>
          <Row style={{ flexWrap: "wrap", gap: space(2) }}>
            {sizes.map((s) => (
              <Chip key={s.key} label={SIZE_LABEL[s.key] ?? s.label} selected={size === s.key} onPress={() => setSize(s.key)} />
            ))}
          </Row>

          {service.key === "deep" && type !== "office" ? (
            <>
              <Text variant="heading">How often?</Text>
              <OptionCard selected={plan === "one_off"} onPress={() => setPlan("one_off")} title="One-time deep clean" subtitle="Single visit" />
              <OptionCard
                selected={plan === "amc"}
                onPress={() => setPlan("amc")}
                title="Annual plan"
                subtitle="Lower price per visit, scheduled through the year"
                right={<Text style={{ color: colors.success, fontFamily: fonts.bold, fontSize: 13 }}>Save more</Text>}
              />
            </>
          ) : null}

          {!fixed ? (
            <Card>
              <Text style={{ fontFamily: fonts.bold }}>How pricing works</Text>
              <Text variant="small">Our team inspects on arrival and sends your quote to the app. You pay securely by card or Tamara, right there. No gateway fees or hidden charges.</Text>
            </Card>
          ) : null}
        </>
      ) : null}

      {step === 1 ? <SlotPicker days={days} day={day} onDay={setDay} hour={hour} onHour={setHour} /> : null}

      {step === 2 ? (
        <>
          <Text variant="heading">Where should we come?</Text>
          {saved.data?.map((a) => (
            <OptionCard
              key={a.id}
              selected={!adding && addressId === a.id}
              onPress={() => {
                setAdding(false);
                setAddressId(a.id);
              }}
              title={`${a.label} · ${a.area}`}
              subtitle={[a.unit, a.building].filter(Boolean).join(", ") || undefined}
            />
          ))}
          {saved.data?.length ? <OptionCard selected={adding} onPress={() => setAdding(true)} title="+ Add a new address" /> : null}

          {adding ? (
            <Card>
              <AddressPicker value={draft} onChange={setDraft} />
            </Card>
          ) : null}
          <Input label="Notes for the team (optional)" value={notes} onChangeText={setNotes} placeholder="Parking, pets, access code…" multiline style={{ minHeight: 70, textAlignVertical: "top" }} />
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Card>
            <Text variant="heading">Booking summary</Text>
            <SummaryRow icon={<ServiceIcon name={service.key} size={26} tile={false} />} label="Service" value={`${service.name}${plan === "amc" ? " · Annual plan" : ""}`} />
            <SummaryRow icon="🏠" label="Property" value={`${PROPERTY.find(([t]) => t === type)![1]} · ${SIZE_LABEL[size] ?? size}`} />
            <SummaryRow icon="🗓️" label="Date & time" value={`${day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${hour != null ? hourLabel(hour) : ""}`} />
            <SummaryRow
              icon="📍"
              label="Address"
              value={(adding ? [draft.unit, draft.building, draft.area] : [selectedAddress?.unit, selectedAddress?.building, selectedAddress?.area]).filter(Boolean).join(", ")}
            />
          </Card>

          <Text variant="heading">Payment method</Text>
          {fixed ? (
            <>
              <OptionCard selected={pay === "card"} onPress={() => setPay("card")} title="Card, Apple Pay or Google Pay" subtitle="Pay securely now" icon={<RNText style={{ fontSize: 22 }}>💳</RNText>} />
              <OptionCard
                selected={pay === "tamara"}
                onPress={() => setPay("tamara")}
                title="Tamara: pay in 4"
                subtitle={price ? `4 interest-free payments of ${aed(Math.round((price / 4) * 100) / 100)}` : "Split into 4 interest-free payments"}
                icon={<TamaraBadge />}
              />
            </>
          ) : (
            <Card tone="gold">
              <Text style={{ fontSize: 14 }}>Nothing to pay now. Our team confirms the price in the app before your visit, then you pay by card or Tamara.</Text>
            </Card>
          )}

          {fixed && price != null ? (
            <Card>
              <PriceRow label={`${service.name} (${SIZE_LABEL[size] ?? size})`} value={aed(price)} />
              <PriceRow label="Gateway fees" value="AED 0" muted />
              <Divider />
              <PriceRow label="Total" value={aed(price)} bold />
            </Card>
          ) : null}
          <Text variant="small">Free cancellation until your team sets off. Paid bookings are refunded automatically.</Text>
        </>
      ) : null}

      <ErrorText error={error} />
    </Screen>
  );
}

function SummaryRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Row style={{ alignItems: "flex-start", marginTop: space(1) }}>
      <View style={{ width: 26, alignItems: "center" }}>{typeof icon === "string" ? <RNText style={{ fontSize: 18 }}>{icon}</RNText> : icon}</View>
      <View style={{ flex: 1 }}>
        <Text variant="small">{label}</Text>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 15 }}>{value}</Text>
      </View>
    </Row>
  );
}

function PriceRow({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }): ReactNode {
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <Text style={{ fontSize: 14, color: muted ? colors.muted : colors.text, fontFamily: bold ? fonts.bold : fonts.regular, flex: 1 }}>{label}</Text>
      <Text style={{ fontSize: bold ? 17 : 14, color: muted ? colors.muted : colors.text, fontFamily: bold ? fonts.extrabold : fonts.semibold }}>{value}</Text>
    </Row>
  );
}
