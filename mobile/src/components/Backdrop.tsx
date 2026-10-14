import { StyleSheet, View } from "react-native";
import Svg, { Defs, Line, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import { colors } from "../lib/theme";

/**
 * The app's background: deep black, a fine tech grid, a gold glow from the top and
 * a cyan glow from the bottom. Static SVG, so it costs nothing at runtime.
 */
export function Backdrop({ intense = false }: { intense?: boolean }) {
  const g = intense ? 0.32 : 0.2;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="grid" width={28} height={28} patternUnits="userSpaceOnUse">
            <Line x1={0} y1={0} x2={28} y2={0} stroke={colors.gold} strokeWidth={0.5} opacity={0.07} />
            <Line x1={0} y1={0} x2={0} y2={28} stroke={colors.gold} strokeWidth={0.5} opacity={0.07} />
          </Pattern>
          <RadialGradient id="goldGlow" cx="18%" cy="0%" rx="85%" ry="45%" fx="18%" fy="0%">
            <Stop offset="0" stopColor={colors.gold} stopOpacity={g} />
            <Stop offset="1" stopColor={colors.gold} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="cyanGlow" cx="100%" cy="100%" rx="80%" ry="40%" fx="100%" fy="100%">
            <Stop offset="0" stopColor={colors.cyan} stopOpacity={g * 0.6} />
            <Stop offset="1" stopColor={colors.cyan} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="vignette" cx="50%" cy="50%" rx="75%" ry="70%">
            <Stop offset="0.55" stopColor="#000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.75} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#grid)" />
        <Rect width="100%" height="100%" fill="url(#goldGlow)" />
        <Rect width="100%" height="100%" fill="url(#cyanGlow)" />
        <Rect width="100%" height="100%" fill="url(#vignette)" />
      </Svg>
    </View>
  );
}
