import { useMemo, useRef, useState } from "react";
import { Image, PanResponder, Pressable, Text as RNText, View, type LayoutChangeEvent } from "react-native";
import { colors, fonts, radius } from "../lib/theme";

/**
 * Map tiles from OpenStreetMap (free, no key). Used on Android, where the native Google map
 * would need a paid-account API key; iPhones use Apple Maps. Tiles follow the OSM tile
 * policy: an identifying User-Agent, the attribution shown on the map, normal caching.
 */
const TILE = 256;
const TILE_URL = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const HEADERS = { "User-Agent": "XtremeCleaningPartner/1.0 (+https://www.xtreme-fmgroup.com)" };

export type LatLng = { lat: number; lng: number };

/** World pixel position of a coordinate at zoom z (Web Mercator). */
export function project(p: LatLng, z: number) {
  const scale = TILE * 2 ** z;
  const sin = Math.sin((p.lat * Math.PI) / 180);
  return { x: ((p.lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
}

export function unproject(pt: { x: number; y: number }, z: number): LatLng {
  const scale = TILE * 2 ** z;
  const lng = (pt.x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * pt.y) / scale;
  return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng };
}

/** Draws the tiles so that `center` sits at screen point `anchor`. */
export function OsmTiles({ width, height, center, zoom, anchor }: { width: number; height: number; center: LatLng; zoom: number; anchor: { x: number; y: number } }) {
  const c = project(center, zoom);
  const left = c.x - anchor.x;
  const top = c.y - anchor.y;
  const max = 2 ** zoom;
  const tiles: { key: string; x: number; y: number; px: number; py: number }[] = [];
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
      if (ty < 0 || ty >= max) continue;
      const wx = ((tx % max) + max) % max;
      tiles.push({ key: `${zoom}/${wx}/${ty}`, x: wx, y: ty, px: tx * TILE - left, py: ty * TILE - top });
    }
  }
  return (
    <View style={{ position: "absolute", left: 0, top: 0, width, height, overflow: "hidden", backgroundColor: "#EEF0EA" }}>
      {tiles.map((t) => (
        <Image key={t.key} source={{ uri: TILE_URL(zoom, t.x, t.y), headers: HEADERS }} style={{ position: "absolute", left: t.px, top: t.py, width: TILE, height: TILE }} fadeDuration={0} />
      ))}
    </View>
  );
}

export function OsmAttribution() {
  return (
    <View style={{ position: "absolute", right: 6, top: 6, backgroundColor: "rgba(255,255,255,0.8)", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
      <RNText style={{ fontSize: 9.5, color: "#555" }}>© OpenStreetMap contributors</RNText>
    </View>
  );
}

/** Largest zoom (≤ 17) at which both points fit in the box. */
export function fitZoom(a: LatLng, b: LatLng, boxW: number, boxH: number) {
  for (let z = 17; z >= 3; z--) {
    const pa = project(a, z);
    const pb = project(b, z);
    if (Math.abs(pa.x - pb.x) <= boxW && Math.abs(pa.y - pb.y) <= boxH) return z;
  }
  return 3;
}

/**
 * A small map you drag to put a fixed pin on the building (address entry).
 * Calls onChange with the coordinate under the pin when the drag ends.
 */
export function OsmPicker({ value, onChange, height = 210 }: { value: LatLng; onChange: (p: LatLng) => void; height?: number }) {
  const [width, setWidth] = useState(340);
  const [zoom, setZoom] = useState(16);
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });
  const state = useRef({ value, zoom });
  state.current = { value, zoom };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => setDrag({ dx: g.dx, dy: g.dy }),
        onPanResponderRelease: (_e, g) => {
          const { value: v, zoom: z } = state.current;
          const p = project(v, z);
          onChange(unproject({ x: p.x - g.dx, y: p.y - g.dy }, z));
          setDrag({ dx: 0, dy: 0 });
        },
      }),
    [onChange],
  );

  const p = project(value, zoom);
  const shown = unproject({ x: p.x - drag.dx, y: p.y - drag.dy }, zoom);
  return (
    <View style={{ height, borderRadius: radius.lg, overflow: "hidden" }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} {...responder.panHandlers}>
      <OsmTiles width={width} height={height} center={shown} zoom={zoom} anchor={{ x: width / 2, y: height / 2 }} />
      <View pointerEvents="none" style={{ position: "absolute", left: width / 2 - 15, top: height / 2 - 38 }}>
        <RNText style={{ fontSize: 32 }}>📍</RNText>
      </View>
      <View style={{ position: "absolute", right: 8, bottom: 8, gap: 6 }}>
        {(["+", "−"] as const).map((s) => (
          <Pressable
            key={s}
            onPress={() => setZoom((z) => Math.max(11, Math.min(18, z + (s === "+" ? 1 : -1))))}
            accessibilityLabel={s === "+" ? "Zoom in" : "Zoom out"}
            style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", elevation: 3 }}
          >
            <RNText style={{ fontSize: 20, fontFamily: fonts.bold, color: colors.text }}>{s}</RNText>
          </Pressable>
        ))}
      </View>
      <OsmAttribution />
    </View>
  );
}
