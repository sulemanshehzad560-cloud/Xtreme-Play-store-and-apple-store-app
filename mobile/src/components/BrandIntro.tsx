import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, Text, View } from "react-native";
import { fonts } from "../lib/theme";

// Same black as the native splash, so the hand-over is seamless.
const BG = "#030405";
const GOLD = "#E2C170";
const MUTED = "#8E8676";

export const BRAND_INTRO_MS = 5000;

/**
 * Opening brand screen: the gold X settles in, the name and a hairline appear, then
 * "Powered by Xtreme Facilities Management". Calls onDone after BRAND_INTRO_MS.
 */
export function BrandIntro({ onDone }: { onDone: () => void }) {
  const mark = useRef(new Animated.Value(0)).current;
  const line = useRef(new Animated.Value(0)).current;
  const name = useRef(new Animated.Value(0)).current;
  const footer = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    const ease = Easing.out(Easing.cubic);
    const t = (v: Animated.Value, toValue: number, duration: number) => Animated.timing(v, { toValue, duration, easing: ease, useNativeDriver: true });
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) {
        [mark, line, name, footer].forEach((v) => v.setValue(1));
        return;
      }
      anim = Animated.sequence([
        t(mark, 1, 900),
        Animated.parallel([t(line, 1, 700), Animated.sequence([Animated.delay(200), t(name, 1, 700)])]),
        Animated.delay(150),
        t(footer, 1, 700),
        Animated.delay(BRAND_INTRO_MS - 900 - 900 - 150 - 700 - 500),
        Animated.timing(out, { toValue: 0, duration: 450, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]);
      anim.start();
    });
    const done = setTimeout(onDone, BRAND_INTRO_MS);
    return () => {
      cancelled = true;
      anim?.stop();
      clearTimeout(done);
    };
  }, []);

  const rise = (v: Animated.Value, by = 10) => ({ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [by, 0] }) }] });

  return (
    <View style={{ flex: 1, backgroundColor: BG }} accessible accessibilityLabel="Xtreme Home Partner, powered by Xtreme Facilities Management">
      <Animated.View style={{ flex: 1, alignItems: "center", justifyContent: "center", opacity: out }}>
        <Animated.Image
          source={require("../../assets/logo-mark.png")}
          resizeMode="contain"
          style={{
            width: 132,
            height: 100,
            opacity: mark,
            transform: [{ scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
          }}
        />
        <Animated.View style={[{ alignItems: "center", marginTop: 28 }, rise(name)]}>
          <Text style={{ color: GOLD, fontFamily: fonts.bold, fontSize: 24, letterSpacing: 9 }}>XTREME</Text>
          <Text style={{ color: "#D9D3C7", fontFamily: fonts.medium, fontSize: 11, letterSpacing: 5, marginTop: 6 }}>HOME PARTNER</Text>
        </Animated.View>
        <Animated.View style={{ width: 56, height: 1, backgroundColor: GOLD, opacity: 0.7, marginTop: 22, transform: [{ scaleX: line }] }} />

        <Animated.View style={[{ position: "absolute", bottom: 64, alignItems: "center" }, rise(footer, 6)]}>
          <Text style={{ color: MUTED, fontFamily: fonts.regular, fontSize: 11, letterSpacing: 2 }}>POWERED BY</Text>
          <Text style={{ color: "#CFC8BA", fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 1.6, marginTop: 6 }}>XTREME FACILITIES MANAGEMENT</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
