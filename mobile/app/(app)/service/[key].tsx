import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import MapView, { PROVIDER_GOOGLE } from "react-native-maps";
import { Button, Card, Chip, ErrorText, Input, Row, Screen, Text } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { aed, SIZE_LABEL } from "@/lib/format";
import { colors, radius, space } from "@/lib/theme";
import type { Booking, Company, Service } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type PropertyType = "apartment" | "villa" | "office";
type Pay = "card" | "tamara" | "cash";
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

const ABU_DHABI = { latitude: 24.4539, longitude: 54.3773 };
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

function nextDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return d;
  });
}

/** Builds an ISO time for `hour`:00 Abu Dhabi time (UTC+4, no daylight saving). */
function abuDhabiTime(day: Date, hour: number) {
  const d = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour - 4, 0, 0));
  return d.toISOString();
}

export default function BookService() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const catalog = useApi<Catalog>("/catalog/services");
  const company = useApi<Company>("/company");
  const saved = useApi<Address[]>("/me/addresses");
  const service = catalog.data?.services.find((s) => s.key === key);

  const [type, setType] = useState<PropertyType>("apartment");
  const [size, setSize] = useState("2bhk");
  const [plan, setPlan] = useState<"one_off" | "amc">("one_off");
  const [day, setDay] = useState<Date>(nextDays(1)[0]!);
  const [hour, setHour] = useState(10);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [pin, setPin] = useState(ABU_DHABI);
  const [area, setArea] = useState("");
  const [building, setBuilding] = useState("");
  const [unit, setUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [pay, setPay] = useState<Pay>("card");
  const [price, setPrice] = useState<{ priceAed: number | null; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(Crypto.randomUUID()).current;
  const map = useRef<MapView>(null);

  const sizes = catalog.data?.propertySizes[type] ?? [];
  const days = useMemo(() => nextDays(14), []);

  useEffect(() => {
    if (sizes.length && !sizes.some((s) => s.key === size)) setSize(sizes[0]!.key);
  }, [type, sizes.length]);

  useEffect(() => {
    const def = saved.data?.find((a) => a.isDefault);
    if (def && !addressId) setAddressId(def.id);
  }, [saved.data]);

  useEffect(() => {
    if (!service) return;
    api<{ priceAed: number | null; label: string }>(`/catalog/quote?serviceKey=${service.key}&propertyType=${type}&propertySize=${size}&plan=${plan}`)
      .then(setPrice)
      .catch(() => setPrice(null));
  }, [service?.key, type, size, plan]);

  async function useMyLocation() {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return setError("Allow location access, or move the map to your building.");
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    setPin(next);
    map.current?.animateToRegion({ ...next, latitudeDelta: 0.005, longitudeDelta: 0.005 });
    const [place] = await Location.reverseGeocodeAsync(next).catch(() => []);
    if (place?.district || place?.subregion) setArea(place.district ?? place.subregion ?? "");
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const newAddress = { label: "Service address", area: area.trim(), building: building.trim() || null, unit: unit.trim() || null, lat: pin.latitude, lng: pin.longitude };
      const body = {
        serviceKey: key,
        propertyType: type,
        propertySize: size,
        plan,
        scheduledAt: abuDhabiTime(day, hour),
        notes: notes.trim() || undefined,
        paymentMethod: price?.priceAed == null ? "cash" : pay,
        ...(addressId
          ? { addressId }
          : { address: newAddress }),
      };
      const booking = await api<Booking>("/bookings", { body, headers: { "Idempotency-Key": idempotencyKey } });
      if (!addressId && area.trim()) {
        void api("/me/addresses", { body: newAddress }).catch(() => undefined);
      }
      if (booking.canPay && (pay === "card" || pay === "tamara")) router.replace(`/booking/${booking.id}/pay?method=${pay}`);
      else router.replace(`/booking/${booking.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "phone_required") {
        router.push("/phone");
        setError("Add your mobile number, then tap Book again.");
      } else setError(e instanceof Error ? e.message : "Could not book");
    } finally {
      setBusy(false);
    }
  }

  if (!service) return <Screen><Text variant="muted">Loading…</Text></Screen>;
  const canSubmit = addressId || area.trim().length >= 2;

  return (
    <Screen>
      <Text variant="title">{service.name}</Text>
      <Text variant="muted">{service.highlights.join(" · ")}</Text>

      <Section title="Property">
        <Row style={{ flexWrap: "wrap" }}>
          {(["apartment", "villa", "office"] as const).map((t) => (
            <Chip key={t} label={t[0]!.toUpperCase() + t.slice(1)} selected={type === t} onPress={() => setType(t)} />
          ))}
        </Row>
        <Row style={{ flexWrap: "wrap" }}>
          {sizes.map((s) => (
            <Chip key={s.key} label={SIZE_LABEL[s.key] ?? s.label} selected={size === s.key} onPress={() => setSize(s.key)} />
          ))}
        </Row>
        {service.key === "deep" && type !== "office" ? (
          <Row>
            <Chip label="One-off" selected={plan === "one_off"} onPress={() => setPlan("one_off")} />
            <Chip label="Annual plan (per visit)" selected={plan === "amc"} onPress={() => setPlan("amc")} />
          </Row>
        ) : null}
      </Section>

      <Section title="Date & time (Abu Dhabi)">
        <Row style={{ flexWrap: "wrap" }}>
          {days.map((d) => (
            <Chip
              key={d.toDateString()}
              label={d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
              selected={d.toDateString() === day.toDateString()}
              onPress={() => setDay(d)}
            />
          ))}
        </Row>
        <Row style={{ flexWrap: "wrap" }}>
          {HOURS.map((h) => (
            <Chip key={h} label={`${String(h).padStart(2, "0")}:00`} selected={hour === h} onPress={() => setHour(h)} />
          ))}
        </Row>
      </Section>

      <Section title="Where">
        {saved.data?.length ? (
          <Row style={{ flexWrap: "wrap" }}>
            {saved.data.map((a) => (
              <Chip key={a.id} label={`${a.label} · ${a.area}`} selected={addressId === a.id} onPress={() => setAddressId(a.id)} />
            ))}
            <Chip label="New address" selected={!addressId} onPress={() => setAddressId(null)} />
          </Row>
        ) : null}
        {!addressId ? (
          <>
            <View style={{ height: 220, borderRadius: radius.lg, overflow: "hidden" }}>
              <MapView
                ref={map}
                provider={PROVIDER_GOOGLE}
                style={{ flex: 1 }}
                initialRegion={{ ...ABU_DHABI, latitudeDelta: 0.15, longitudeDelta: 0.15 }}
                onRegionChangeComplete={(r) => setPin({ latitude: r.latitude, longitude: r.longitude })}
                showsUserLocation
              />
              {/* The pin is fixed in the middle; customers move the map under it. */}
              <View pointerEvents="none" style={{ position: "absolute", left: "50%", top: "50%", marginLeft: -12, marginTop: -30 }}>
                <Text style={{ fontSize: 30, color: colors.gold }}>📍</Text>
              </View>
            </View>
            <Button title="Use my current location" variant="secondary" onPress={useMyLocation} />
            <Row style={{ flexWrap: "wrap" }}>
              {company.data?.serviceAreas.slice(0, 12).map((a) => (
                <Chip key={a} label={a} selected={area === a} onPress={() => setArea(a)} />
              ))}
            </Row>
            <Input label="Area" value={area} onChangeText={setArea} placeholder="e.g. Al Reem Island" />
            <Input label="Building / villa" value={building} onChangeText={setBuilding} />
            <Input label="Flat / unit" value={unit} onChangeText={setUnit} />
          </>
        ) : null}
        <Input label="Notes for the team (optional)" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 80, paddingTop: space(3) }} />
      </Section>

      <Section title="Payment">
        {price?.priceAed != null ? (
          <Row style={{ flexWrap: "wrap" }}>
            <Chip label="Card / Apple Pay / Google Pay" selected={pay === "card"} onPress={() => setPay("card")} />
            <Chip label="Tamara: pay in 4" selected={pay === "tamara"} onPress={() => setPay("tamara")} />
            <Chip label="Pay on the day" selected={pay === "cash"} onPress={() => setPay("cash")} />
          </Row>
        ) : (
          <Text variant="muted">We'll confirm the price after a free survey. You can pay in the app then.</Text>
        )}
      </Section>

      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Text variant="muted">Total (VAT included)</Text>
          <Text variant="heading" style={{ color: colors.goldHi }}>
            {price ? aed(price.priceAed) : "…"}
          </Text>
        </Row>
      </Card>
      <ErrorText error={error} />
      <Button title={price?.priceAed != null && pay !== "cash" ? "Book & pay" : "Book now"} onPress={submit} loading={busy} disabled={!canSubmit} />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space(3) }}>
      <Text variant="gold">{title}</Text>
      {children}
    </View>
  );
}
