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
import { PlanPromo } from "@/components/Promo";
import { SlotPicker, abuDhabiTime, firstOpenDay, hourLabel, nextDays } from "@/components/SlotPicker";

type PropertyType = "apartment" | "villa" | "office" | "restaurant";
type Pay = "card" | "tamara";
type Frequency = "one_time" | "weekly" | "biweekly";
interface Catalog {
  services: Service[];
  propertySizes: Record<PropertyType, { key: string; label: string }[]>;
  regularRates?: Record<string, { priceAed: number; minutes: number; cleaners: number }>;
  /** Fixed prices set in the dashboard: service → property type → size. */
  rates?: Record<string, Partial<Record<PropertyType, Record<string, { priceAed: number; minutes: number; cleaners: number }>>>>;
  payments?: { tamaraFeePercent: number; tamaraInstalments: number; cardFeePercent?: number; serviceFeeAed?: number };
  frequencyDiscountPercent?: { weekly: number; biweekly: number };
}
interface Quote {
  priceAed: number | null;
  basePriceAed?: number;
  discountPercent?: number;
  pricing: "fixed" | "inspection";
  durationMinutes: number | null;
  cleaners: number | null;
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
  ["restaurant", "Restaurant", "🍽️"],
];
const FREQUENCY: [Frequency, string, string][] = [
  ["one_time", "One time", "A single visit"],
  ["weekly", "Weekly", "Same day and time every week"],
  ["biweekly", "Bi-weekly", "Every two weeks"],
];

const duration = (min: number) => (min < 60 ? `${min} min` : min % 60 ? `${Math.floor(min / 60)}½ hrs` : `${min / 60} hr${min > 60 ? "s" : ""}`);

export default function BookService() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const catalog = useApi<Catalog>("/catalog/services");
  const saved = useApi<Address[]>("/me/addresses");
  const service = catalog.data?.services.find((s) => s.key === key);

  const [step, setStep] = useState(0);
  const [type, setType] = useState<PropertyType>("apartment");
  const [size, setSize] = useState("2bhk");
  const [frequency, setFrequency] = useState<Frequency>("one_time");
  const days = useMemo(() => nextDays(14), []);
  const [day, setDay] = useState(() => firstOpenDay(days));
  const [hour, setHour] = useState<number | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Partial<NewAddress>>({ label: "Home" });
  const [notes, setNotes] = useState("");
  const [pay, setPay] = useState<Pay>("card");
  const [q, setQ] = useState<Quote | null | undefined>(undefined);
  const price = q === undefined ? undefined : (q?.priceAed ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(Crypto.randomUUID()).current;

  const sizes = catalog.data?.propertySizes[type] ?? [];
  const types = PROPERTY.filter(([t]) => (service?.propertyTypes ?? ["apartment", "villa", "office"]).includes(t));
  // Fixed prices come from the office's price list; anything without one is quoted on a site visit.
  const fixed = q?.pricing === "fixed" && price != null;
  const rates = service ? (catalog.data?.rates ? catalog.data.rates[service.key]?.[type] : service.key === "regular" && type === "apartment" ? catalog.data?.regularRates : undefined) : undefined;
  const feePct = catalog.data?.payments?.tamaraFeePercent ?? 8;
  const cardPct = catalog.data?.payments?.cardFeePercent ?? 0;
  const serviceFee = catalog.data?.payments?.serviceFeeAed ?? 0;
  const tamaraFee = price != null ? Math.round(price * feePct) / 100 : 0;
  const cardFee = price != null ? Math.round(price * cardPct) / 100 : 0;
  const payTotal = price != null ? Math.round((price + serviceFee + (pay === "tamara" ? tamaraFee : cardFee)) * 100) / 100 : null;
  const savePct = (f: Frequency) => (f === "one_time" ? 0 : (catalog.data?.frequencyDiscountPercent?.[f] ?? 0));

  useEffect(() => {
    if (service && !types.some(([t]) => t === type)) setType(types[0]![0]);
  }, [service?.key]);

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
    if (!sizes.some((s) => s.key === size)) return;
    const freq = service.key === "regular" ? `&frequency=${frequency}` : "";
    api<Quote>(`/catalog/quote?serviceKey=${service.key}&propertyType=${type}&propertySize=${size}${freq}`)
      .then(setQ)
      .catch(() => setQ(undefined));
  }, [service?.key, type, size, sizes.length, frequency]);

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
          plan: "one_off",
          ...(service?.key === "regular" ? { frequency } : {}),
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
  const totalLabel = q === undefined ? "…" : fixed ? aed(step === 3 ? payTotal : price!) : "On site visit";
  const cta = step < 3 ? "Continue" : fixed ? `Pay ${aed(payTotal)}` : "Book site visit";

  return (
    <Screen
      edges={["left", "right"]}
      footer={
        <StickyFooter>
          <View style={{ flex: 1 }}>
            <Text variant="small">{fixed ? (frequency === "one_time" ? "Total" : "Per visit") : "Price"}</Text>
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
                  {ratingLabel(service)} · {service.startingFromAed ? `from ${aed(service.startingFromAed)}` : "price on site visit"}
                </Text>
              </View>
            </Row>
            <Divider />
            <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), backgroundColor: colors.successSoft, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(2) }}>
              <RNText style={{ fontSize: 16 }}>🧴</RNText>
              <Text style={{ flex: 1, color: colors.success, fontFamily: fonts.bold, fontSize: 13.5 }}>Cleaning materials included FREE</Text>
            </View>
            {service.highlights.filter((h) => !/materials included free/i.test(h)).map((h) => (
              <Row key={h} style={{ gap: space(2) }}>
                <RNText style={{ color: colors.success, fontSize: 15 }}>✓</RNText>
                <Text style={{ fontSize: 14, flex: 1 }}>{h}</Text>
              </Row>
            ))}
          </Card>

          <Text variant="heading">Property type</Text>
          <Row style={{ gap: space(2) }}>
            {types.map(([t, label, icon]) => (
              <View key={t} style={{ flex: 1 }}>
                <Chip icon={icon} label={label} selected={type === t} onPress={() => setType(t)} />
              </View>
            ))}
          </Row>

          <Text variant="heading">Size</Text>
          {rates ? (
            <View style={{ gap: space(2) }}>
              {sizes.map((s) => {
                const r = rates[s.key];
                const on = size === s.key;
                return (
                  <OptionCard
                    key={s.key}
                    selected={on}
                    onPress={() => setSize(s.key)}
                    title={SIZE_LABEL[s.key] ?? s.label}
                    subtitle={r ? `${duration(r.minutes)} · ${r.cleaners} cleaners · materials free` : "Free site visit, priced on site · materials free"}
                    right={<Text style={{ fontFamily: fonts.extrabold, fontSize: r ? 16 : 13, color: on ? colors.gold : colors.text }}>{r ? aed(r.priceAed) : "On quote"}</Text>}
                  />
                );
              })}
            </View>
          ) : (
            <Row style={{ flexWrap: "wrap", gap: space(2) }}>
              {sizes.map((s) => (
                <Chip key={s.key} label={SIZE_LABEL[s.key] ?? s.label} selected={size === s.key} onPress={() => setSize(s.key)} />
              ))}
            </Row>
          )}

          {service.key === "regular" ? (
            <>
              <Text variant="heading">How often?</Text>
              <Row style={{ gap: space(2) }}>
                {FREQUENCY.map(([f, label, sub]) => (
                  <View key={f} style={{ flex: 1 }}>
                    <Chip label={label} sub={savePct(f) ? `Save ${savePct(f)}% per visit` : sub} selected={frequency === f} onPress={() => setFrequency(f)} />
                  </View>
                ))}
              </Row>
              {frequency !== "one_time" ? (
                <Text variant="small">
                  After each visit we set up the next one {frequency === "weekly" ? "a week" : "two weeks"} later at the same time. You pay each visit in the app, and can skip or stop any time.
                </Text>
              ) : null}
              <PlanPromo />
            </>
          ) : null}

          {q && !fixed ? (
            <Card tone="gold">
              <Row style={{ gap: space(2) }}>
                <RNText style={{ fontSize: 20 }}>📋</RNText>
                <Text style={{ fontFamily: fonts.bold, flex: 1 }}>Priced on a site visit</Text>
              </Row>
              <Text style={{ fontSize: 14, lineHeight: 20 }}>
                {service.key === "deep"
                  ? "Every deep clean is different. The price depends on the property and whether it is empty or occupied. "
                  : ""}
                Our team visits at the time you choose, checks the job and sends your quote to the app. Nothing to pay now; you pay securely in the app once you accept the quote.
              </Text>
            </Card>
          ) : null}
        </>
      ) : null}

      {step === 1 ? (
        <SlotPicker
          days={days}
          day={day}
          onDay={setDay}
          hour={hour}
          onHour={setHour}
          title={fixed ? "Pick a day" : "When can we visit?"}
          note={fixed ? undefined : "This is the time for the site visit. The schedule for the work is agreed with you once the quotation is finalized."}
        />
      ) : null}

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
            <SummaryRow
              icon={<ServiceIcon name={service.key} size={26} tile={false} />}
              label="Service"
              value={`${service.name}${frequency !== "one_time" && service.key === "regular" ? ` · ${frequency === "weekly" ? "Weekly" : "Bi-weekly"}` : ""}`}
            />
            {q?.durationMinutes ? <SummaryRow icon="⏱️" label="Team & time" value={`${q.cleaners} cleaners · about ${duration(q.durationMinutes)} · materials free`} /> : null}
            <SummaryRow icon="🏠" label="Property" value={`${PROPERTY.find(([t]) => t === type)![1]} · ${SIZE_LABEL[size] ?? size}`} />
            <SummaryRow icon="🗓️" label={fixed ? "Date & time" : "Site visit"} value={`${day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${hour != null ? hourLabel(hour) : ""}`} />
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
                subtitle={price ? `4 payments of ${aed(Math.round(((price + serviceFee + tamaraFee) / 4) * 100) / 100)} · includes ${feePct}% Tamara fee` : "Split into 4 payments"}
                icon={<TamaraBadge />}
              />
            </>
          ) : (
            <Card tone="gold">
              <Text style={{ fontSize: 14 }}>Nothing to pay now. Our team inspects on the visit and sends your quote to the app; you pay by card or Tamara once you accept it.</Text>
            </Card>
          )}

          {fixed && price != null ? (
            <Card>
              <PriceRow label={`${service.name} (${SIZE_LABEL[size] ?? size})`} value={aed(q?.basePriceAed ?? price)} />
              {q?.basePriceAed ? (
                <PriceRow label={`${frequency === "weekly" ? "Weekly" : "Bi-weekly"} saving (${q.discountPercent}%)`} value={`– ${aed(q.basePriceAed - price)}`} muted />
              ) : null}
              <PriceRow label="Cleaning materials" value="FREE" muted />
              {serviceFee > 0 ? <PriceRow label="Service fee" value={aed(serviceFee)} muted /> : null}
              {pay === "tamara" ? (
                <PriceRow label={`Tamara fee (${feePct}%)`} value={aed(tamaraFee)} muted />
              ) : cardPct > 0 ? (
                <PriceRow label={`Card fee (${cardPct}%)`} value={aed(cardFee)} muted />
              ) : (
                <PriceRow label="Card fees" value="None" muted />
              )}
              <Divider />
              <PriceRow label={frequency === "one_time" ? "Total" : "Total per visit"} value={aed(payTotal)} bold />
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
