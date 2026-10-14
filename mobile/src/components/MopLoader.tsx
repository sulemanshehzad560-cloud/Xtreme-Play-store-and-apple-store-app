import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import Svg, { Defs, G, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { colors } from "../lib/theme";
import { Text } from "./ui";

// Drawing space; the whole scene is scaled by `size`.
const W = 280;
const H = 170;
const RUG = { x: 22, y: 100, w: 236, h: 54 };
const MOP_W = 64;
const MOP_H = 120;
const MOP_START = RUG.x - 6;
const TRAVEL = RUG.w - MOP_W + 12;
/** Dirt spots: [x, y, rx, ry] in scene units. */
const SPOTS = [
  [70, 116, 9, 5],
  [104, 136, 7, 4],
  [142, 120, 10, 5],
  [182, 138, 8, 4],
  [218, 118, 9, 5],
] as const;

const MESSAGES = ["Rolling out the rug…", "Mopping things up…", "Making it sparkle…"];

/**
 * Brand loading animation: a mop sweeps back and forth over a rug, wiping away
 * dirt spots that sparkle as they disappear. Pure Animated + SVG, native-driven.
 */
export function MopLoader({ size = 1, label, cycleMessages = !label }: { size?: number; label?: string; cycleMessages?: boolean }) {
  const p = useRef(new Animated.Value(0)).current; // 0→1 sweep right, 1→2 sweep back
  const bubbles = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const [still, setStill] = useState(false);
  const [msg, setMsg] = useState(0);

  useEffect(() => {
    let loops: Animated.CompositeAnimation[] = [];
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) {
        setStill(true);
        p.setValue(1);
        return;
      }
      const ease = Easing.inOut(Easing.sin);
      loops = [
        Animated.loop(
          Animated.sequence([
            Animated.timing(p, { toValue: 1, duration: 1400, easing: ease, useNativeDriver: true }),
            Animated.timing(p, { toValue: 2, duration: 1400, easing: ease, useNativeDriver: true }),
          ]),
        ),
        ...bubbles.map((b, i) =>
          Animated.loop(
            Animated.sequence([
              Animated.delay(i * 320),
              Animated.timing(b, { toValue: 1, duration: 950, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            ]),
          ),
        ),
      ];
      loops.forEach((l) => l.start());
    });
    return () => {
      cancelled = true;
      loops.forEach((l) => l.stop());
    };
  }, []);

  useEffect(() => {
    if (!cycleMessages) return;
    const t = setInterval(() => setMsg((m) => (m + 1) % MESSAGES.length), 1600);
    return () => clearInterval(t);
  }, [cycleMessages]);

  const mopX = p.interpolate({ inputRange: [0, 1, 2], outputRange: [0, TRAVEL, 0] });
  // The handle trails behind the direction of travel.
  const tilt = p.interpolate({
    inputRange: [0, 0.1, 0.9, 1, 1.1, 1.9, 2],
    outputRange: ["0deg", "-13deg", "-13deg", "0deg", "13deg", "13deg", "0deg"],
  });
  const shine = p.interpolate({ inputRange: [0, 1, 1.85, 2], outputRange: [0.001, 1, 1, 0.001] });

  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label ?? "Loading"} style={{ alignItems: "center", gap: 10 * size }}>
      <View style={{ width: W * size, height: H * size }}>
        <View style={{ width: W, height: H, transform: [{ scale: size }], transformOrigin: "top left" }}>
          <Rug />

          {/* Freshly cleaned shine that follows the mop. */}
          <Animated.View
            style={{
              position: "absolute",
              left: RUG.x + 6,
              top: RUG.y + 6,
              width: RUG.w - 12,
              height: RUG.h - 12,
              borderRadius: 4,
              backgroundColor: colors.goldHi,
              opacity: 0.14,
              transformOrigin: "left center",
              transform: [{ scaleX: shine }],
            }}
          />

          {SPOTS.map(([x, y, rx, ry], i) => {
            const f = (x - MOP_START - MOP_W / 2) / TRAVEL; // when the mop head reaches this spot
            const gone = p.interpolate({
              inputRange: [0, Math.max(0.001, f - 0.02), f + 0.06, 1.9, 2],
              outputRange: [1, 1, 0, 0, 1],
              extrapolate: "clamp",
            });
            const sparkle = p.interpolate({
              inputRange: [0, f, f + 0.1, f + 0.4, 2],
              outputRange: [0, 0, 1, 0, 0],
              extrapolate: "clamp",
            });
            return (
              <View key={i}>
                <Animated.View style={{ position: "absolute", left: x - rx, top: y - ry, opacity: still ? 0 : gone }}>
                  {/* a smudge with a couple of droplets beside it */}
                  <View style={{ width: rx * 2, height: ry * 2, borderRadius: rx, backgroundColor: "#6B5638" }} />
                  <View style={{ position: "absolute", left: rx * 2 - 1, top: -2, width: 4, height: 4, borderRadius: 2, backgroundColor: "#6B5638" }} />
                  <View style={{ position: "absolute", left: -4, top: ry * 2 - 2, width: 3, height: 3, borderRadius: 2, backgroundColor: "#6B5638" }} />
                </Animated.View>
                <Animated.Text
                  style={{
                    position: "absolute",
                    left: x - 7,
                    top: y - 26,
                    fontSize: 16,
                    color: colors.goldHi,
                    opacity: sparkle,
                    transform: [{ scale: sparkle }],
                  }}
                >
                  ✦
                </Animated.Text>
              </View>
            );
          })}

          <Animated.View
            style={{
              position: "absolute",
              left: MOP_START,
              top: RUG.y + RUG.h / 2 - MOP_H + 6,
              width: MOP_W,
              height: MOP_H,
              transformOrigin: "bottom center",
              transform: [{ translateX: mopX }, { rotate: tilt }],
            }}
          >
            {bubbles.map((b, i) => (
              <Animated.View
                key={i}
                style={{
                  position: "absolute",
                  left: 14 + i * 14,
                  top: MOP_H - 30,
                  width: 7 + (i % 2) * 3,
                  height: 7 + (i % 2) * 3,
                  borderRadius: 6,
                  borderWidth: 1.2,
                  borderColor: "rgba(246,240,227,0.75)",
                  opacity: b.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.9, 0] }),
                  transform: [
                    { translateY: b.interpolate({ inputRange: [0, 1], outputRange: [0, -34] }) },
                    { translateX: b.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, i % 2 ? 4 : -4, 0] }) },
                  ],
                }}
              />
            ))}
            <Mop />
          </Animated.View>
        </View>
      </View>
      {label || cycleMessages ? (
        <Text variant="muted" style={{ fontSize: 15 * Math.max(0.85, size) }}>
          {label ?? MESSAGES[msg]}
        </Text>
      ) : null}
    </View>
  );
}

function Rug() {
  const { x, y, w, h } = RUG;
  const fringe = Array.from({ length: 9 }, (_, i) => y + 5 + i * ((h - 10) / 8));
  const diamonds = Array.from({ length: 7 }, (_, i) => x + 26 + i * ((w - 52) / 6));
  return (
    <Svg width={W} height={H} style={{ position: "absolute" }}>
      <Defs>
        <LinearGradient id="rug" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2A2318" />
          <Stop offset="1" stopColor="#17130D" />
        </LinearGradient>
        <LinearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.goldHi} />
          <Stop offset="1" stopColor={colors.goldLo} />
        </LinearGradient>
      </Defs>
      {/* soft floor shadow */}
      <Rect x={x + 4} y={y + h - 2} width={w - 8} height={8} rx={4} fill="#000" opacity={0.45} />
      {fringe.map((fy) => (
        <G key={fy}>
          <Line x1={x - 9} y1={fy} x2={x} y2={fy} stroke={colors.gold} strokeWidth={1.4} strokeLinecap="round" />
          <Line x1={x + w} y1={fy} x2={x + w + 9} y2={fy} stroke={colors.gold} strokeWidth={1.4} strokeLinecap="round" />
        </G>
      ))}
      <Rect x={x} y={y} width={w} height={h} rx={5} fill="url(#rug)" stroke="url(#gold)" strokeWidth={2} />
      <Rect x={x + 6} y={y + 6} width={w - 12} height={h - 12} rx={3} fill="none" stroke={colors.goldLo} strokeWidth={1} strokeDasharray="4 3" />
      {diamonds.map((dx) => (
        <Path
          key={dx}
          d={`M ${dx} ${y + h / 2 - 9} L ${dx + 9} ${y + h / 2} L ${dx} ${y + h / 2 + 9} L ${dx - 9} ${y + h / 2} Z`}
          fill="none"
          stroke={colors.goldLo}
          strokeWidth={1.2}
          opacity={0.8}
        />
      ))}
    </Svg>
  );
}

function Mop() {
  const strands = Array.from({ length: 9 }, (_, i) => 10 + i * 5.5);
  return (
    <Svg width={MOP_W} height={MOP_H} style={{ position: "absolute" }}>
      <Defs>
        <LinearGradient id="handle" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={colors.goldHi} />
          <Stop offset="1" stopColor={colors.goldLo} />
        </LinearGradient>
      </Defs>
      {/* handle */}
      <Rect x={MOP_W / 2 - 2.5} y={0} width={5} height={MOP_H - 30} rx={2.5} fill="url(#handle)" />
      <Rect x={MOP_W / 2 - 4} y={0} width={8} height={10} rx={3} fill={colors.goldLo} />
      {/* head */}
      <Rect x={7} y={MOP_H - 33} width={MOP_W - 14} height={8} rx={3} fill="url(#handle)" />
      {/* cotton strands */}
      {strands.map((sx, i) => (
        <Path
          key={sx}
          d={`M ${sx} ${MOP_H - 26} Q ${sx + 1.5} ${MOP_H - 15} ${sx - 1 + (i % 2)} ${MOP_H - 3 - (i % 3)}`}
          stroke={i % 2 ? "#F6F0E3" : "#E8DFCB"}
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}
