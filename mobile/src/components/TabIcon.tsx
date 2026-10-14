import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { ColorValue } from "react-native";

/** Line icons for the tab bar. */
export function TabIcon({ name, color, size = 24 }: { name: "home" | "bookings" | "account"; color: ColorValue; size?: number }) {
  const c = color as string;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {name === "home" ? (
        <>
          <Path d="M3 10.5 12 3l9 7.5" />
          <Path d="M5 9.5V20h14V9.5" />
          <Path d="M10 20v-5h4v5" />
        </>
      ) : name === "bookings" ? (
        <>
          <Rect x={3.5} y={5} width={17} height={15} rx={2.5} />
          <Path d="M3.5 9.5h17M8 3v4M16 3v4M8 13.5h3M8 16.5h6" />
        </>
      ) : (
        <>
          <Circle cx={12} cy={8.5} r={4} />
          <Path d="M4.5 20c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
        </>
      )}
    </Svg>
  );
}
