import { useEffect, useRef, useState } from "react";
import { Platform, Text as RNText, View, type LayoutChangeEvent } from "react-native";
import Constants from "expo-constants";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import Svg, { Circle, Path } from "react-native-svg";
import { OsmAttribution, OsmTiles, fitZoom, project, unproject } from "./OsmMap";
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
 * OpenStreetMap version (Android without a Google Maps key): real streets, the customer's
 * home and the team's van, zoomed so both fit above the bottom sheet.
 */
function DrawnMap({ destination, van, heading }: { destination: LatLng; van: LatLng | null; heading?: number | null }) {
  const [size, setSize] = useState({ w: 360, h: 640 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  // Room above the bottom sheet (which covers roughly the lower 40%).
  const box = { w: size.w - 120, h: size.h * 0.42 };
  const zoom = van ? fitZoom(destination, van, box.w, box.h) : 15;
  const mid = van ? unproject({ x: (project(destination, zoom).x + project(van, zoom).x) / 2, y: (project(destination, zoom).y + project(van, zoom).y) / 2 }, zoom) : destination;
  const anchor = { x: size.w / 2, y: size.h * 0.32 };
  const c = project(mid, zoom);
  const toXY = (p: LatLng) => {
    const q = project(p, zoom);
    return { x: anchor.x + q.x - c.x, y: anchor.y + q.y - c.y };
  };
  const home = toXY(destination);
  const v = van ? toXY(van) : null;
  return (
    <View style={{ flex: 1, backgroundColor: "#EEF0EA" }} onLayout={onLayout}>
      <OsmTiles width={size.w} height={size.h} center={mid} zoom={zoom} anchor={anchor} />
      <Svg width={size.w} height={size.h} style={{ position: "absolute" }}>
        {v ? <Path d={`M ${v.x} ${v.y} L ${home.x} ${home.y}`} stroke={colors.gold} strokeWidth={4} strokeDasharray="2 8" strokeLinecap="round" /> : null}
        <Circle cx={home.x} cy={home.y} r={34} fill={colors.gold} opacity={0.18} />
      </Svg>
      <View style={{ position: "absolute", left: home.x - 18, top: home.y - 42 }}>
        <HomePin />
      </View>
      {v ? (
        <View style={{ position: "absolute", left: v.x - 20, top: v.y - 20, transform: [{ rotate: `${(heading ?? 0) - 90}deg` }] }}>
          <VanDot />
        </View>
      ) : null}
      <SafeTopAttribution />
    </View>
  );
}

function SafeTopAttribution() {
  return (
    <View pointerEvents="none" style={{ position: "absolute", right: 0, top: 44 }}>
      <OsmAttribution />
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
