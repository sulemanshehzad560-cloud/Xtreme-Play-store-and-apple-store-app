import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Text, View } from "react-native";
import Svg, { G, Line, Path, Rect } from "react-native-svg";
import { fonts } from "../lib/theme";

// Drawing space; the whole scene is scaled by `size`.
const W = 260;
const H = 150;
const RUG = { x: 30, y: 98, w: 200, h: 40 };
const MOP_W = 48;
const MOP_H = 112;
const MOP_START = RUG.x - 4;
const TRAVEL = RUG.w - MOP_W + 8;

const MESSAGES = ["Getting things ready…", "Almost there…"];

/** Muted line-art palette per background. */
const TONES = {
  dark: { rug: "#14120E", edge: "#8C7440", detail: "#5A4B2C", handle: "#C9A75A", strands: "#E6DFD0", clean: "#E2C170", text: "#A79E8D" },
  light: { rug: "#F3EEE4", edge: "#C8B07A", detail: "#E0D3B4", handle: "#B98F35", strands: "#8C8476", clean: "#B98F35", text: "#6F685C" },
};

/**
 * Brand loading animation: a mop glides across a rug and leaves a soft clean trail.
 * Quiet line art in the Xtreme gold; pure Animated + SVG, native-driven.
 */
export function MopLoader({ size = 1, label, cycleMessages = false, tone = "light" }: { size?: number; label?: string; cycleMessages?: boolean; tone?: "light" | "dark" }) {
  const c = TONES[tone];
  const p = useRef(new Animated.Value(0)).current; // 0→1 glide right, 1→2 glide back
  const [msg, setMsg] = useState(0);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) return p.setValue(0.5);
      const ease = Easing.inOut(Easing.cubic);
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(p, { toValue: 1, duration: 1300, easing: ease, useNativeDriver: true }),
          Animated.delay(120),
          Animated.timing(p, { toValue: 2, duration: 1300, easing: ease, useNativeDriver: true }),
          Animated.delay(120),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, []);

  useEffect(() => {
    if (!cycleMessages) return;
    const t = setInterval(() => setMsg((m) => (m + 1) % MESSAGES.length), 2200);
    return () => clearInterval(t);
  }, [cycleMessages]);

  const mopX = p.interpolate({ inputRange: [0, 1, 2], outputRange: [0, TRAVEL, 0] });
  // A gentle lean against the direction of travel.
  const tilt = p.interpolate({
    inputRange: [0, 0.15, 0.85, 1, 1.15, 1.85, 2],
    outputRange: ["0deg", "-7deg", "-7deg", "0deg", "7deg", "7deg", "0deg"],
  });
  // The clean trail grows behind the mop, then fades on the way back.
  const trail = p.interpolate({ inputRange: [0, 1, 2], outputRange: [0.001, 1, 1] });
  const trailOpacity = p.interpolate({ inputRange: [0, 1, 1.6, 2], outputRange: [0.12, 0.12, 0.06, 0] });

  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label ?? "Loading"} style={{ alignItems: "center", gap: 8 * size }}>
      <View style={{ width: W * size, height: H * size }}>
        <View style={{ width: W, height: H, transform: [{ scale: size }], transformOrigin: "top left" }}>
          <Rug c={c} />
          <Animated.View
            style={{
              position: "absolute",
              left: RUG.x + 5,
              top: RUG.y + 5,
              width: RUG.w - 10,
              height: RUG.h - 10,
              borderRadius: 3,
              backgroundColor: c.clean,
              opacity: trailOpacity,
              transformOrigin: "left center",
              transform: [{ scaleX: trail }],
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              left: MOP_START,
              top: RUG.y + RUG.h / 2 - MOP_H + 4,
              width: MOP_W,
              height: MOP_H,
              transformOrigin: "bottom center",
              transform: [{ translateX: mopX }, { rotate: tilt }],
            }}
          >
            <Mop c={c} />
          </Animated.View>
        </View>
      </View>
      {label || cycleMessages ? (
        <Text style={{ fontFamily: fonts.medium, fontSize: 14 * Math.max(0.85, size), letterSpacing: 0.2, color: c.text }}>{label ?? MESSAGES[msg]}</Text>
      ) : null}
    </View>
  );
}

function Rug({ c }: { c: (typeof TONES)["dark"] }) {
  const { x, y, w, h } = RUG;
  const fringe = Array.from({ length: 6 }, (_, i) => y + 6 + i * ((h - 12) / 5));
  return (
    <Svg width={W} height={H} style={{ position: "absolute" }}>
      {fringe.map((fy) => (
        <G key={fy}>
          <Line x1={x - 6} y1={fy} x2={x} y2={fy} stroke={c.edge} strokeWidth={1} strokeLinecap="round" />
          <Line x1={x + w} y1={fy} x2={x + w + 6} y2={fy} stroke={c.edge} strokeWidth={1} strokeLinecap="round" />
        </G>
      ))}
      <Rect x={x} y={y} width={w} height={h} rx={4} fill={c.rug} stroke={c.edge} strokeWidth={1.2} />
      <Rect x={x + 5} y={y + 5} width={w - 10} height={h - 10} rx={2} fill="none" stroke={c.detail} strokeWidth={0.8} />
      <Line x1={x + 18} y1={y + h / 2} x2={x + w - 18} y2={y + h / 2} stroke={c.detail} strokeWidth={0.8} strokeDasharray="2 5" />
    </Svg>
  );
}

function Mop({ c }: { c: (typeof TONES)["dark"] }) {
  const head = MOP_H - 28; // top of the mop head
  const left = 6;
  const right = MOP_W - 6;
  // A soft cotton head: a rounded fringe shape, with a few fine lines for texture.
  const scallops = Array.from({ length: 6 }, (_, i) => left + ((right - left) / 6) * (i + 0.5));
  const bottom = MOP_H - 3;
  const outline =
    `M ${left + 4} ${head + 6} L ${right - 4} ${head + 6} Q ${right + 1} ${head + 14} ${right} ${bottom - 4} ` +
    scallops
      .slice()
      .reverse()
      .map((x) => `Q ${x} ${bottom + 2} ${x - (right - left) / 12} ${bottom - 3}`)
      .join(" ") +
    ` Q ${left - 1} ${head + 14} ${left + 4} ${head + 6} Z`;
  return (
    <Svg width={MOP_W} height={MOP_H} style={{ position: "absolute" }}>
      <Rect x={MOP_W / 2 - 1.5} y={2} width={3} height={head + 2} rx={1.5} fill={c.handle} />
      <Path d={outline} fill={c.strands} />
      {scallops.slice(1).map((x) => (
        <Line key={x} x1={x - (right - left) / 12} y1={head + 11} x2={x - (right - left) / 12 + 0.5} y2={bottom - 6} stroke={c.rug} strokeWidth={0.8} opacity={0.35} />
      ))}
      <Rect x={left + 2} y={head + 2} width={right - left - 4} height={6} rx={3} fill={c.handle} />
    </Svg>
  );
}
