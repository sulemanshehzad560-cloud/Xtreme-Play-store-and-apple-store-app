import { useEffect, useRef, useState } from "react";
import { Platform, Text as RNText, View, type LayoutChangeEvent } from "react-native";
import Constants from "expo-constants";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors } from "../lib/theme";

type LatLng = { lat: number; lng: number };

/** Real maps on iOS (Apple Maps) and on Android when a Google Maps key is configured. */
export const MAPS_AVAILABLE = Platform.OS === "ios" || Boolean(Constants.expoConfig?.extra?.androidMapsEnabled);

/** Shows the customer's address and, when live, the team's van with its heading. */
export function LiveMap({ destination, van, heading }: { destination: LatLng; van: LatLng | null; heading?: number | null }) {
  return MAPS_AVAILABLE ? <RealMap destination={destination} van={van} heading={heading} /> : <DrawnMap destination={destination} van={van} heading={heading} />;
}

function RealMap({ destination, van, heading }: { destination: LatLng; van: LatLng | null; heading?: number | null }) {
  const map = useRef<MapView>(null);
  useEffect(() => {
    if (!van) return;
    map.current?.fitToCoordinates(
      [
        { latitude: van.lat, longitude: van.lng },
        { latitude: destination.lat, longitude: destination.lng },
      ],
      { edgePadding: { top: 90, bottom: 320, left: 60, right: 60 }, animated: true },
    );
  }, [van?.lat, van?.lng]);
  return (
    <MapView
      ref={map}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      style={{ flex: 1 }}
      initialRegion={{ latitude: destination.lat, longitude: destination.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
    >
      <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} anchor={{ x: 0.5, y: 1 }}>
        <HomePin />
      </Marker>
      {van ? (
        <Marker coordinate={{ latitude: van.lat, longitude: van.lng }} anchor={{ x: 0.5, y: 0.5 }} flat rotation={heading ?? 0}>
          <VanDot />
        </Marker>
      ) : null}
    </MapView>
  );
}

/**
 * A drawn street map used when no map provider is configured (e.g. demo builds):
 * a neighbourhood grid centred on the customer, with the van positioned to scale.
 */
function DrawnMap({ destination, van, heading }: { destination: LatLng; van: LatLng | null; heading?: number | null }) {
  const [size, setSize] = useState({ w: 360, h: 640 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  // Zoom so both the home and the van fit, with room for the bottom sheet.
  const reach = van ? Math.max(Math.abs(van.lat - destination.lat), Math.abs(van.lng - destination.lng)) : 0;
  const span = Math.max(0.02, reach * 2.6); // degrees shown across the width
  const scale = size.w / span;
  // Centre on the midpoint between van and home (upper part of the screen, above the sheet).
  const mid = van ? { lat: (van.lat + destination.lat) / 2, lng: (van.lng + destination.lng) / 2 } : destination;
  const cx = size.w / 2;
  const cy = size.h * 0.3;
  const toXY = (p: LatLng) => ({ x: cx + (p.lng - mid.lng) * scale, y: cy - (p.lat - mid.lat) * scale });
  const home = toXY(destination);
  const v = van ? toXY(van) : null;

  const roads: string[] = [];
  for (let i = -6; i <= 6; i++) {
    roads.push(`M ${cx + i * 70 - 40} -20 L ${cx + i * 70 + 40} ${size.h + 20}`);
    roads.push(`M -20 ${cy + i * 85} L ${size.w + 20} ${cy + i * 85 - 30}`);
  }
  return (
    <View style={{ flex: 1, backgroundColor: "#EEF0EA" }} onLayout={onLayout}>
      <Svg width={size.w} height={size.h} style={{ position: "absolute" }}>
        <Rect x={size.w * 0.62} y={-10} width={size.w * 0.5} height={size.h * 0.22} rx={40} fill="#CFE3F1" />
        <Rect x={-30} y={size.h * 0.7} width={size.w * 0.45} height={size.h * 0.18} rx={30} fill="#DDEBD5" />
        {roads.map((d, i) => (
          <Path key={i} d={d} stroke="#FFFFFF" strokeWidth={i % 4 === 0 ? 14 : 8} strokeLinecap="round" />
        ))}
        {v ? <Path d={`M ${v.x} ${v.y} L ${home.x} ${home.y}`} stroke={colors.gold} strokeWidth={4} strokeDasharray="2 8" strokeLinecap="round" /> : null}
        <Circle cx={home.x} cy={home.y} r={34} fill={colors.gold} opacity={0.14} />
      </Svg>
      <View style={{ position: "absolute", left: home.x - 18, top: home.y - 42 }}>
        <HomePin />
      </View>
      {v ? (
        <View style={{ position: "absolute", left: v.x - 20, top: v.y - 20, transform: [{ rotate: `${(heading ?? 0) - 90}deg` }] }}>
          <VanDot />
        </View>
      ) : null}
    </View>
  );
}

function HomePin() {
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.surface }}>
        <RNText style={{ fontSize: 16 }}>🏠</RNText>
      </View>
      <View style={{ width: 3, height: 8, backgroundColor: colors.ink }} />
    </View>
  );
}

function VanDot() {
  return (
    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.goldBright, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.surface, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
      <RNText style={{ fontSize: 18 }}>🚐</RNText>
    </View>
  );
}
