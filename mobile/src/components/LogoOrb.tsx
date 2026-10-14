import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import { Image } from "expo-image";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { colors } from "../lib/theme";

/** The logo inside two counter-rotating neon rings. */
export function LogoOrb({ size = 190 }: { size?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver: true }));
      loop.start();
    });
    return () => loop?.stop();
  }, []);
  const cw = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const ccw = spin.interpolate({ inputRange: [0, 1], outputRange: ["360deg", "0deg"] });
  const r1 = size / 2 - 3;
  const r2 = size / 2 - 14;
  const logo = size * 0.62;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ position: "absolute", transform: [{ rotate: cw }] }}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="ringA" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.goldHi} />
              <Stop offset="1" stopColor={colors.gold} stopOpacity={0.1} />
            </LinearGradient>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} r={r1} stroke="url(#ringA)" strokeWidth={2} fill="none" strokeDasharray={`${r1 * 1.6} ${r1 * 0.5}`} strokeLinecap="round" />
        </Svg>
      </Animated.View>
      <Animated.View style={{ position: "absolute", transform: [{ rotate: ccw }] }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r2} stroke={colors.cyan} strokeOpacity={0.75} strokeWidth={1.4} fill="none" strokeDasharray="2 9" strokeLinecap="round" />
        </Svg>
      </Animated.View>
      <View style={{ width: logo, height: logo, borderRadius: logo / 2, backgroundColor: "#000", shadowColor: colors.gold, shadowOpacity: 0.6, shadowRadius: 26, shadowOffset: { width: 0, height: 0 }, elevation: 14 }}>
        <Image source={require("../../assets/logo.png")} style={{ width: logo, height: logo, borderRadius: logo / 2, borderWidth: 1, borderColor: colors.goldLo }} accessibilityLabel="Xtreme logo" />
      </View>
    </View>
  );
}
