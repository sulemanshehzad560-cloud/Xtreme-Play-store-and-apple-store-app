import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, Text as RNText, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Constants from "expo-constants";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import Svg, { Circle, Path } from "react-native-svg";
import { OsmAttribution, OsmTiles, fitZoom, project, unproject } from "./OsmMap";
import { colors, fonts } from "../lib/theme";
import { t } from "@/lib/i18n";

type LatLng = { lat: number; lng: number };

/** Real maps on iOS (Apple Maps) and on Android when a Google Maps key is configured. */
export const MAPS_AVAILABLE = Platform.OS === "ios" || Boolean(Constants.expoConfig?.extra?.androidMapsEnabled);

/** Shows the customer's address and, when live, the team's van with its heading. */
export function LiveMap({ destination, van, heading }: { destination: LatLng; van: LatLng | null; heading?: number | null }) {
  return MAPS_AVAILABLE ? <RealMap destination={destination} van={van} heading={heading} /> : <DrawnMap destination={destination} van={van} heading={heading} />;
}

function RealMap({ destination, van, heading }: { destination: LatLng; van: LatLng | null; heading?: number | null }) {
  const map = useRef<MapView>(null);
  // Once the customer pinches or drags, stop snapping back to the van on every location update.
  const [follow, setFollow] = useState(true);
  const fit = () => {
    if (!van) {
      map.current?.animateToRegion({ latitude: destination.lat, longitude: destination.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 });
      return;
    }
    map.current?.fitToCoordinates(
      [
        { latitude: van.lat, longitude: van.lng },
        { latitude: destination.lat, longitude: destination.lng },
      ],
      { edgePadding: { top: 90, bottom: 320, left: 60, right: 60 }, animated: true },
    );
  };
  useEffect(() => {
    if (follow) fit();
  }, [van?.lat, van?.lng, follow]);
  return (
    <View style={{ flex: 1 }}>
    <MapView
      ref={map}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      style={{ flex: 1 }}
      zoomEnabled
      scrollEnabled
      rotateEnabled={false}
      onPanDrag={() => setFollow(false)}
      onRegionChangeComplete={(_r, d) => {
        if (d?.isGesture) setFollow(false);
      }}
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
      <MapControls
        onZoom={(d) => {
          setFollow(false);
          void map.current?.getCamera().then((cam) => {
            if (cam.zoom != null) map.current?.animateCamera({ zoom: Math.max(3, Math.min(20, cam.zoom + d)) }, { duration: 250 });
            else if (cam.altitude != null) map.current?.animateCamera({ altitude: cam.altitude * (d > 0 ? 0.5 : 2) }, { duration: 250 });
          });
        }}
        onRecenter={follow ? undefined : () => setFollow(true)}
      />
    </View>
  );
}

/**
 * OpenStreetMap version (Android without a Google Maps key): real streets, the customer's
 * home and the team's van. It follows both automatically until the customer pinches, drags
 * or uses the +/− buttons; "re-centre" goes back to following.
 */
function DrawnMap({ destination, van, heading }: { destination: LatLng; van: LatLng | null; heading?: number | null }) {
  const [size, setSize] = useState({ w: 360, h: 640 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  // Room above the bottom sheet (which covers roughly the lower 40%).
  const box = { w: size.w - 120, h: size.h * 0.42 };
  const autoZoom = van ? fitZoom(destination, van, box.w, box.h) : 15;
  const autoMid = van ? unproject({ x: (project(destination, autoZoom).x + project(van, autoZoom).x) / 2, y: (project(destination, autoZoom).y + project(van, autoZoom).y) / 2 }, autoZoom) : destination;

  // Customer's own view: null while following automatically.
  const [view, setView] = useState<{ zoom: number; center: LatLng } | null>(null);
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });
  const zoom = view?.zoom ?? autoZoom;
  const base = view?.center ?? autoMid;
  const live = useRef({ zoom, base });
  live.current = { zoom, base };

  const setZoom = (z: number) => setView({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)), center: live.current.base });

  const responder = useMemo(() => {
    let pinchStart = 0;
    const spread = (e: GestureResponderEvent) => {
      const t = e.nativeEvent.touches;
      return t.length >= 2 ? Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY) : 0;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        pinchStart = 0;
      },
      onPanResponderMove: (e, g) => {
        const d = spread(e);
        if (d > 0) {
          // Two fingers: step the zoom each time the pinch grows or shrinks enough.
          if (!pinchStart) pinchStart = d;
          const ratio = d / pinchStart;
          if (ratio > 1.35 || ratio < 0.74) {
            pinchStart = d;
            const { zoom: z, base: b } = live.current;
            setView({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + (ratio > 1 ? 1 : -1))), center: b });
          }
          setDrag({ dx: 0, dy: 0 });
          return;
        }
        if (!pinchStart) setDrag({ dx: g.dx, dy: g.dy });
      },
      onPanResponderRelease: (_e, g) => {
        const { zoom: z, base: b } = live.current;
        if (!pinchStart && (Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3)) {
          const p = project(b, z);
          setView({ zoom: z, center: unproject({ x: p.x - g.dx, y: p.y - g.dy }, z) });
        }
        pinchStart = 0;
        setDrag({ dx: 0, dy: 0 });
      },
    });
  }, []);

  const p0 = project(base, zoom);
  const mid = unproject({ x: p0.x - drag.dx, y: p0.y - drag.dy }, zoom);
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
      <View style={{ flex: 1 }} {...responder.panHandlers}>
        <OsmTiles width={size.w} height={size.h} center={mid} zoom={zoom} anchor={anchor} />
        <Svg width={size.w} height={size.h} style={{ position: "absolute" }} pointerEvents="none">
          {v ? <Path d={`M ${v.x} ${v.y} L ${home.x} ${home.y}`} stroke={colors.gold} strokeWidth={4} strokeDasharray="2 8" strokeLinecap="round" /> : null}
          <Circle cx={home.x} cy={home.y} r={34} fill={colors.gold} opacity={0.18} />
        </Svg>
        <View pointerEvents="none" style={{ position: "absolute", left: home.x - 18, top: home.y - 42 }}>
          <HomePin />
        </View>
        {v ? (
          <View pointerEvents="none" style={{ position: "absolute", left: v.x - 20, top: v.y - 20, transform: [{ rotate: `${(heading ?? 0) - 90}deg` }] }}>
            <VanDot />
          </View>
        ) : null}
      </View>
      <SafeTopAttribution />
      <MapControls onZoom={(d) => setZoom(zoom + d)} onRecenter={view ? () => setView(null) : undefined} />
    </View>
  );
}

const MIN_ZOOM = 10;
const MAX_ZOOM = 18;

/** +/− zoom buttons and a "re-centre" button, top right below the attribution. */
function MapControls({ onZoom, onRecenter }: { onZoom: (delta: number) => void; onRecenter?: () => void }) {
  const btn = { width: 44, height: 44, backgroundColor: colors.surface, alignItems: "center" as const, justifyContent: "center" as const };
  return (
    <View style={{ position: "absolute", right: 14, top: 120, gap: 10, alignItems: "flex-end" }}>
      <View style={{ borderRadius: 12, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4, backgroundColor: colors.surface }}>
        <Pressable onPress={() => onZoom(1)} accessibilityRole="button" accessibilityLabel={t("Zoom in")} style={btn}>
          <RNText style={{ fontSize: 22, fontFamily: fonts.bold, color: colors.text }}>+</RNText>
        </Pressable>
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <Pressable onPress={() => onZoom(-1)} accessibilityRole="button" accessibilityLabel={t("Zoom out")} style={btn}>
          <RNText style={{ fontSize: 22, fontFamily: fonts.bold, color: colors.text }}>−</RNText>
        </Pressable>
      </View>
      {onRecenter ? (
        <Pressable onPress={onRecenter} accessibilityRole="button" accessibilityLabel={t("Re-centre the map on the team")} style={{ ...btn, borderRadius: 22, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Circle cx={12} cy={12} r={4} fill={colors.gold} />
            <Circle cx={12} cy={12} r={8} stroke={colors.text} strokeWidth={2} fill="none" />
            <Path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke={colors.text} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </Pressable>
      ) : null}
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
