import { useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

const reduceMotion = () => AccessibilityInfo.isReduceMotionEnabled().catch(() => false);

/** Fades and lifts its children in; `delay` lets lists cascade. */
export function FadeIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    reduceMotion().then((reduce) => {
      if (reduce) return v.setValue(1);
      Animated.timing(v, { toValue: 1, duration: 380, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  }, []);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Grey placeholder block that gently pulses while content loads. */
export function Skeleton({ width, height, radius = 10, style }: { width: number | `${number}%`; height: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: "#E9E3D7", opacity: v }, style]} />;
}

/** A card-shaped skeleton for lists. */
export function SkeletonCard() {
  return (
    <View style={{ backgroundColor: "#fff", borderRadius: 18, padding: 16, gap: 10, borderWidth: 1, borderColor: "#ECE6DA" }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Skeleton width={46} height={46} radius={14} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="45%" height={12} />
        </View>
      </View>
      <Skeleton width="100%" height={12} />
    </View>
  );
}

const CONFETTI = ["#E2C170", "#16130E", "#F6DE9E", "#1E9E5A", "#B98F35", "#4E8DB8"];

/**
 * Celebration for a confirmed booking or payment: a gold tick pops in and
 * confetti bursts outwards.
 */
export function SuccessBurst({ size = 140 }: { size?: number }) {
  const pop = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    reduceMotion().then((reduce) => {
      if (reduce) {
        pop.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
        Animated.timing(burst, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    });
  }, []);
  const pieces = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    const dist = size * (0.55 + (i % 3) * 0.12);
    return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, color: CONFETTI[i % CONFETTI.length]!, round: i % 2 === 0 };
  });
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            width: p.round ? 9 : 6,
            height: p.round ? 9 : 14,
            borderRadius: p.round ? 5 : 2,
            backgroundColor: p.color,
            opacity: burst.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
              { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }) },
              { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${(i % 2 ? 1 : -1) * 220}deg`] }) },
            ],
          }}
        />
      ))}
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <Svg width={size * 0.62} height={size * 0.62} viewBox="0 0 100 100">
          <Circle cx={50} cy={50} r={46} fill="#E2C170" stroke="#16130E" strokeWidth={4} />
          <Path d="M30 52 L44 66 L71 37" fill="none" stroke="#16130E" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}
