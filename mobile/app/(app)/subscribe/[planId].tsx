import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { AddressPicker, completeAddress, type NewAddress } from "@/components/AddressPicker";
import { ServiceIcon } from "@/components/art/ServiceIcon";
import { abuDhabiTime, hourLabel } from "@/components/SlotPicker";
import { MonthCalendar, fromKey } from "@/components/MonthCalendar";
import { Button, Card, Chip, Divider, ErrorText, InlineLoader, Input, OptionCard, Row, Screen, StepBar, StickyFooter, Text } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { aed, SIZE_LABEL } from "@/lib/format";
import { colors, fonts, space } from "@/lib/theme";
import type { Interval, Subscription, SubscriptionPlan } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { LineIcon, type LineIconName } from "@/components/LineIcon";

type PropertyType = "apartment" | "villa" | "office";
interface Address {
  id: string;
  label: string;
  area: string;
  building: string | null;
  unit: string | null;
  isDefault: boolean;
}

const STEPS = ["Plan", "Schedule", "Address", "Review & pay"];
const shortDay = (k: string) => fromKey(k).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const PROPERTY: [PropertyType, string, LineIconName][] = [
  ["apartment", "Apartment", "office"],
  ["villa", "Villa", "villa"],
  ["office", "Office", "briefcase"],
];

export default function Subscribe() {
  const params = useLocalSearchParams<{ planId: string; interval?: Interval }>();
  const plans = useApi<SubscriptionPlan[]>("/subscription-plans");
  const catalog = useApi<{ propertySizes: Record<PropertyType, { key: string; label: string }[]> }>("/catalog/services");
  const saved = useApi<Address[]>("/me/addresses");
  const plan = plans.data?.find((p) => p.id === params.planId);

  const [step, setStep] = useState(0);
  const [interval, setInterval] = useState<Interval>(params.interval === "yearly" ? "yearly" : "monthly");
  const [type, setType] = useState<PropertyType>("apartment");
  const [size, setSize] = useState("2bhk");
  const [picked, setPicked] = useState<string[]>([]);
  const [hour, setHour] = useState<number | null>(null);
  const until = new Date(Date.now() + 30 * 86_400_000);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Partial<NewAddress>>({ label: "Home" });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sizes = catalog.data?.propertySizes[type] ?? [];
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
    if (plan && (interval === "monthly" ? plan.priceMonthlyAed : plan.priceYearlyAed) == null) setInterval(interval === "monthly" ? "yearly" : "monthly");
  }, [plan?.id]);

  if (!plan) {
    return (
      <Screen edges={["left", "right"]}>
        <InlineLoader label="Loading the plan…" />
      </Screen>
    );
  }

  const price = (interval === "monthly" ? plan.priceMonthlyAed : plan.priceYearlyAed) ?? 0;
  const visits = plan.visitsPerMonth * (interval === "monthly" ? 1 : 12);
  const visitDays = [...picked].sort();
  const canContinue = [true, visitDays.length > 0 && hour != null, adding ? Boolean(completeAddress(draft)) : Boolean(addressId), true][step];
  const selectedAddress = saved.data?.find((a) => a.id === addressId);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const newAddress = completeAddress(draft);
      let useId = adding ? null : addressId;
      if (adding && newAddress) useId = (await api<Address>("/me/addresses", { body: newAddress }).catch(() => null))?.id ?? null;
      const res = await api<{ subscription: Subscription; paymentBookingId: string }>("/subscriptions", {
        body: {
          planId: plan!.id,
          interval,
          propertyType: type,
          propertySize: size,
          firstVisitAt: abuDhabiTime(fromKey(visitDays[0]!), hour!),
          moreVisits: visitDays.slice(1).map((k) => abuDhabiTime(fromKey(k), hour!)),
          notes: notes.trim() || undefined,
          ...(useId ? { addressId: useId } : { address: newAddress }),
        },
      });
      router.replace(`/booking/${res.paymentBookingId}/pay`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "phone_required") {
        router.push("/phone");
        setError("Add your mobile number, then tap Subscribe again.");
      } else setError(e instanceof Error ? e.message : "Could not subscribe");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      edges={["left", "right"]}
      footer={
        <StickyFooter>
          <View style={{ flex: 1 }}>
            <Text variant="small">{interval === "monthly" ? "Per month" : "Per year"}</Text>
            <Text variant="price">{aed(price)}</Text>
          </View>
          <Button
            title={step < 3 ? "Continue" : `Subscribe & pay ${aed(price)}`}
            onPress={() => (step < 3 ? setStep(step + 1) : submit())}
            disabled={!canContinue}
            loading={busy}
            style={{ flex: 1.4 }}
          />
        </StickyFooter>
      }
    >
      <Stack.Screen
        options={{
          title: plan.name,
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
              <ServiceIcon name={plan.service.key} size={48} tile={false} />
              <View style={{ flex: 1 }}>
                <Text variant="heading">{plan.name}</Text>
                <Text variant="small">
                  {plan.service.name} · {plan.visitsPerMonth} visit{plan.visitsPerMonth > 1 ? "s" : ""} a month
                </Text>
              </View>
            </Row>
            {plan.description ? <Text style={{ fontSize: 14 }}>{plan.description}</Text> : null}
          </Card>
          <Text variant="heading">Billing</Text>
          {plan.priceMonthlyAed != null ? (
            <OptionCard selected={interval === "monthly"} onPress={() => setInterval("monthly")} title={`Monthly · ${aed(plan.priceMonthlyAed)}`} subtitle={`${plan.visitsPerMonth} visits included each month`} />
          ) : null}
          {plan.priceYearlyAed != null ? (
            <OptionCard
              selected={interval === "yearly"}
              onPress={() => setInterval("yearly")}
              title={`Yearly · ${aed(plan.priceYearlyAed)}`}
              subtitle={`${plan.visitsPerMonth * 12} visits included over 12 months`}
              right={plan.priceMonthlyAed ? <Text style={{ color: colors.success, fontFamily: fonts.bold, fontSize: 13 }}>Save {aed(plan.priceMonthlyAed * 12 - plan.priceYearlyAed)}</Text> : undefined}
            />
          ) : null}
          <Text variant="heading">Property type</Text>
          <Row style={{ gap: space(2) }}>
            {PROPERTY.map(([t, label, icon]) => (
              <View key={t} style={{ flex: 1 }}>
                <Chip icon={<LineIcon name={icon} size={24} color={type === t ? colors.gold : colors.muted} />} label={label} selected={type === t} onPress={() => setType(t)} />
              </View>
            ))}
          </Row>
          <Text variant="heading">Size</Text>
          <Row style={{ flexWrap: "wrap", gap: space(2) }}>
            {sizes.map((s) => (
              <Chip key={s.key} label={SIZE_LABEL[s.key] ?? s.label} selected={size === s.key} onPress={() => setSize(s.key)} />
            ))}
          </Row>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <Card tone="gold">
            <Text style={{ fontFamily: fonts.bold }}>Plan your month</Text>
            <Text style={{ fontSize: 14, lineHeight: 20 }}>
              Your plan includes {plan.visitsPerMonth} visit{plan.visitsPerMonth > 1 ? "s" : ""} a month. Tap the days you want; the first one is paid now and the rest are booked
              automatically as soon as the payment goes through. You can add or change visits later from My subscriptions.
            </Text>
          </Card>
          <MonthCalendar selected={picked} onChange={setPicked} max={plan.visitsPerMonth} until={until} hour={hour} onHour={setHour} firstLabel="PAID" />
        </>
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
        <Card>
          <Text variant="heading">Summary</Text>
          <Line label="Plan" value={`${plan.name} · ${interval}`} />
          <Line label="Included visits" value={`${visits} ${interval === "monthly" ? "this month" : "over 12 months"}`} />
          <Line label="Property" value={`${type} · ${SIZE_LABEL[size] ?? size}`} />
          <Line label={visitDays.length > 1 ? `Visits (${visitDays.length})` : "Visit"} value={`${visitDays.map(shortDay).join("\n")}\nat ${hour != null ? hourLabel(hour) : ""}`} />
          <Line label="Address" value={adding ? (draft.area ?? "") : `${selectedAddress?.label ?? ""} · ${selectedAddress?.area ?? ""}`} />
          <Divider />
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={{ fontFamily: fonts.bold }}>Total today</Text>
            <Text variant="price">{aed(price)}</Text>
          </Row>
          <Text variant="small">
            Paid securely with your first visit. Your {interval === "monthly" ? "month" : "year"} starts when the payment goes through. No automatic charges: renew from My subscriptions when it ends.
          </Text>
          <ErrorText error={error} />
        </Card>
      ) : null}
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <Row style={{ justifyContent: "space-between", gap: space(3) }}>
      <Text variant="small">{label}</Text>
      <Text style={{ fontFamily: fonts.semibold, flexShrink: 1, textAlign: "right", textTransform: label === "Property" ? "capitalize" : "none" }}>{value}</Text>
    </Row>
  );
}
