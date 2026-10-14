import { useState } from "react";
import { Text as RNText, View } from "react-native";
import * as Location from "expo-location";
import MapView, { PROVIDER_GOOGLE } from "react-native-maps";
import { Platform } from "react-native";
import { MAPS_AVAILABLE } from "./LiveMap";
import { Button, Chip, Input, Row, Text } from "./ui";
import { colors, radius, shadow, space } from "../lib/theme";

// Approximate area centres, used when a customer picks an area instead of a map pin.
export const AREAS: [string, number, number][] = [
  ["Al Reem Island", 24.4958, 54.4035],
  ["Saadiyat Island", 24.542, 54.433],
  ["Yas Island", 24.4968, 54.6046],
  ["Al Raha Beach", 24.4497, 54.6036],
  ["Khalifa City", 24.4196, 54.5763],
  ["Mohammed Bin Zayed City", 24.3364, 54.5418],
  ["Al Reef", 24.459, 54.6773],
  ["Masdar City", 24.4269, 54.6176],
  ["Corniche", 24.4672, 54.3328],
  ["Al Khalidiyah", 24.471, 54.348],
  ["Mussafah", 24.354, 54.495],
  ["Al Ain", 24.2075, 55.7447],
];

export interface NewAddress {
  label: string;
  area: string;
  building: string | null;
  unit: string | null;
  lat: number;
  lng: number;
}

/**
 * Address form: drag the map under a fixed pin (where maps are available), use GPS,
 * or pick an area; then building and flat number.
 */
export function AddressPicker({ value, onChange }: { value: Partial<NewAddress>; onChange: (v: Partial<NewAddress>) => void }) {
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<NewAddress>) => onChange({ ...value, ...patch });

  async function locate() {
    setError(null);
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return setError("Location permission is off. Choose your area instead.");
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const [place] = await Location.reverseGeocodeAsync(pos.coords).catch(() => []);
    set({ lat: pos.coords.latitude, lng: pos.coords.longitude, area: place?.district ?? place?.subregion ?? place?.city ?? "Current location" });
  }

  return (
    <View style={{ gap: space(3) }}>
      {MAPS_AVAILABLE ? (
        <View style={{ height: 210, borderRadius: radius.lg, overflow: "hidden", ...shadow.card }}>
          <MapView
            provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
            style={{ flex: 1 }}
            region={{ latitude: value.lat ?? 24.4539, longitude: value.lng ?? 54.3773, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
            onRegionChangeComplete={(r) => set({ lat: r.latitude, lng: r.longitude })}
            showsUserLocation
          />
          <View pointerEvents="none" style={{ position: "absolute", left: "50%", top: "50%", marginLeft: -15, marginTop: -38 }}>
            <RNText style={{ fontSize: 32 }}>📍</RNText>
          </View>
          <View style={{ position: "absolute", left: space(3), bottom: space(3), backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1) }}>
            <Text variant="small">Move the map to your building</Text>
          </View>
        </View>
      ) : null}
      <Button title="📍  Use my current location" variant="secondary" onPress={locate} />
      {error ? <Text variant="small" style={{ color: colors.danger }}>{error}</Text> : null}
      <Text variant="label">Area</Text>
      <Row style={{ flexWrap: "wrap", gap: space(2) }}>
        {AREAS.map(([a, lat, lng]) => (
          <Chip key={a} label={a} selected={value.area === a} onPress={() => set({ area: a, ...(MAPS_AVAILABLE && value.lat ? {} : { lat, lng }) })} />
        ))}
      </Row>
      {value.area && !AREAS.some(([a]) => a === value.area) ? <Text variant="small">📍 {value.area}</Text> : null}
      <Input label="Building / villa name" value={value.building ?? ""} onChangeText={(t) => set({ building: t })} placeholder="e.g. Sky Tower" />
      <Input label="Flat / villa number" value={value.unit ?? ""} onChangeText={(t) => set({ unit: t })} placeholder="e.g. 1204" />
    </View>
  );
}

/** Fills in coordinates from the chosen area when no pin/GPS position was set. */
export function completeAddress(v: Partial<NewAddress>): NewAddress | null {
  if (!v.area || v.area.trim().length < 2) return null;
  const preset = AREAS.find(([a]) => a === v.area);
  const lat = v.lat ?? preset?.[1];
  const lng = v.lng ?? preset?.[2];
  if (lat == null || lng == null) return null;
  return { label: v.label || "Home", area: v.area.trim(), building: v.building?.trim() || null, unit: v.unit?.trim() || null, lat, lng };
}
