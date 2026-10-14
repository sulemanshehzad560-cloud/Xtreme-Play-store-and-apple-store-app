import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { sparkle } from "./ServiceIcon";

// Illustrated scenes for banners, onboarding and empty states, in the same ink /
// gold / cream style as the service icons.

const INK = "#16130E";
const GOLD = "#E2C170";
const GOLD_DARK = "#B98F35";
const CREAM = "#FFF6DF";
const SKY = "#DCEAF5";
const LEAF = "#7FB77E";
const s = { stroke: INK, strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** Living room with a gleaming sofa, plant, window and spray bottle. */
export function LivingRoomScene({ width = 180, height = 140 }: { width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 180 140">
      <G {...s}>
        <Rect x={98} y={12} width={60} height={46} rx={4} fill={SKY} />
        <Line x1={128} y1={12} x2={128} y2={58} />
        <Line x1={98} y1={35} x2={158} y2={35} />
        <Path d="M30 120 V96 Q30 84 42 84 H110 Q122 84 122 96 V120" fill={GOLD} />
        <Rect x={20} y={98} width={18} height={26} rx={7} fill={CREAM} />
        <Rect x={114} y={98} width={18} height={26} rx={7} fill={CREAM} />
        <Rect x={36} y={104} width={80} height={14} rx={4} fill={CREAM} />
        <Rect x={48} y={90} width={20} height={14} rx={4} fill={CREAM} />
        <Path d="M150 124 L146 102 H166 L162 124 Z" fill={CREAM} />
        <Path d="M156 102 Q144 84 152 70 Q158 86 156 102 Q166 82 174 80 Q168 96 156 102" fill={LEAF} />
        <Line x1={10} y1={124} x2={176} y2={124} />
      </G>
      <Path d={sparkle(70, 70, 8)} fill={GOLD} stroke={INK} strokeWidth={1.6} />
      <Path d={sparkle(90, 60, 5)} fill={CREAM} stroke={INK} strokeWidth={1.4} />
      <Path d={sparkle(140, 76, 6)} fill={GOLD} stroke={INK} strokeWidth={1.4} />
      <Path d={sparkle(22, 72, 5)} fill={CREAM} stroke={INK} strokeWidth={1.4} />
    </Svg>
  );
}

/** Phone with a four-part payment ring (Tamara "pay in 4"). */
export function PayInFourScene({ width = 160, height = 140 }: { width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 160 140">
      <G {...s}>
        <Rect x={44} y={8} width={72} height={126} rx={12} fill={CREAM} />
        <Line x1={70} y1={18} x2={90} y2={18} />
        <Circle cx={80} cy={66} r={26} fill="#fff" />
        <Path d="M80 40 A26 26 0 0 1 106 66 L80 66 Z" fill={GOLD} />
        <Path d="M106 66 A26 26 0 0 1 80 92 L80 66 Z" fill={GOLD_DARK} />
        <Rect x={58} y={104} width={44} height={12} rx={6} fill={INK} />
      </G>
      <Path d={sparkle(130, 30, 7)} fill={GOLD} stroke={INK} strokeWidth={1.4} />
      <Path d={sparkle(28, 92, 6)} fill={CREAM} stroke={INK} strokeWidth={1.4} />
    </Svg>
  );
}

/** AC unit blowing cool air with snowflakes. */
export function CoolAirScene({ width = 160, height = 140 }: { width?: number; height?: number }) {
  const flake = (x: number, y: number, r: number) => (
    <G key={`${x}-${y}`} stroke="#4E8DB8" strokeWidth={2} strokeLinecap="round">
      <Line x1={x - r} y1={y} x2={x + r} y2={y} />
      <Line x1={x - r * 0.5} y1={y - r * 0.87} x2={x + r * 0.5} y2={y + r * 0.87} />
      <Line x1={x - r * 0.5} y1={y + r * 0.87} x2={x + r * 0.5} y2={y - r * 0.87} />
    </G>
  );
  return (
    <Svg width={width} height={height} viewBox="0 0 160 140">
      <G {...s}>
        <Rect x={14} y={14} width={132} height={44} rx={10} fill={CREAM} />
        <Line x1={26} y1={46} x2={134} y2={46} />
        <Circle cx={128} cy={28} r={3} fill={GOLD} stroke="none" />
      </G>
      <G stroke="#4E8DB8" strokeWidth={3.2} strokeLinecap="round" fill="none">
        <Path d="M30 72 q10 8 20 0 t20 0 t20 0 t20 0" />
        <Path d="M40 92 q10 8 20 0 t20 0 t20 0" />
        <Path d="M54 112 q10 8 20 0 t20 0" />
      </G>
      {flake(24, 104, 8)}
      {flake(136, 100, 9)}
      {flake(118, 126, 6)}
    </Svg>
  );
}

/** Onboarding 1: phone with a booking calendar and a confirmed tick. */
export function BookScene({ size = 240 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.85} viewBox="0 0 240 204">
      <Circle cx={120} cy={104} r={92} fill="#FBF1DA" />
      <G {...s}>
        <Rect x={70} y={18} width={100} height={176} rx={16} fill="#fff" />
        <Rect x={82} y={44} width={76} height={70} rx={8} fill={CREAM} />
        <Line x1={82} y1={60} x2={158} y2={60} />
        {[0, 1, 2, 3].map((c) =>
          [0, 1, 2].map((r) => (
            <Rect key={`${c}-${r}`} x={88 + c * 17} y={66 + r * 15} width={11} height={10} rx={2} fill={c === 2 && r === 1 ? GOLD : "#fff"} strokeWidth={1.6} />
          )),
        )}
        <Rect x={82} y={126} width={76} height={14} rx={7} fill={INK} />
        <Rect x={82} y={148} width={50} height={10} rx={5} fill={CREAM} />
        <Circle cx={170} cy={150} r={22} fill={GOLD} />
        <Path d="M160 150 L167 157 L181 142" fill="none" strokeWidth={3.4} />
      </G>
      <Path d={sparkle(48, 48, 10)} fill={GOLD} stroke={INK} strokeWidth={1.6} />
      <Path d={sparkle(204, 70, 7)} fill={CREAM} stroke={INK} strokeWidth={1.4} />
    </Svg>
  );
}

/** Onboarding 2: map with a route, a van and the home pin. */
export function TrackScene({ size = 240 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.85} viewBox="0 0 240 204">
      <Circle cx={120} cy={104} r={92} fill="#E8F0EA" />
      <G stroke="#fff" strokeWidth={10} strokeLinecap="round">
        <Line x1={40} y1={70} x2={200} y2={60} />
        <Line x1={60} y1={150} x2={210} y2={140} />
        <Line x1={90} y1={20} x2={80} y2={190} />
        <Line x1={170} y1={24} x2={160} y2={190} />
      </G>
      <Path d="M84 66 C90 110 120 120 162 136" stroke={GOLD_DARK} strokeWidth={4} strokeDasharray="2 9" strokeLinecap="round" fill="none" />
      <G {...s}>
        <Path d="M164 96 C152 96 146 105 146 113 C146 126 164 142 164 142 C164 142 182 126 182 113 C182 105 176 96 164 96 Z" fill={INK} />
        <Circle cx={164} cy={113} r={6} fill={GOLD} />
        <Rect x={56} y={50} width={46} height={26} rx={6} fill={GOLD} />
        <Path d="M102 58 H112 L118 66 V76 H102 Z" fill={CREAM} />
        <Circle cx={68} cy={78} r={6} fill={INK} />
        <Circle cx={106} cy={78} r={6} fill={INK} />
      </G>
      <Path d={sparkle(206, 46, 8)} fill={GOLD} stroke={INK} strokeWidth={1.4} />
    </Svg>
  );
}

/** Onboarding 3: card, Tamara and a security shield. */
export function PayScene({ size = 240 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.85} viewBox="0 0 240 204">
      <Defs>
        <LinearGradient id="goldCard" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F6DE9E" />
          <Stop offset="1" stopColor="#C79A3E" />
        </LinearGradient>
      </Defs>
      <Circle cx={120} cy={104} r={92} fill="#FBF1DA" />
      <G {...s}>
        <Rect x={40} y={56} width={120} height={76} rx={10} fill={INK} transform="rotate(-10 100 94)" />
        <Rect x={70} y={78} width={120} height={76} rx={10} fill="url(#goldCard)" />
        <Rect x={84} y={94} width={20} height={14} rx={3} fill={CREAM} />
        <Line x1={84} y1={130} x2={150} y2={130} />
        <Line x1={84} y1={140} x2={120} y2={140} />
        <Path d="M190 116 L210 124 V138 C210 152 200 160 190 164 C180 160 170 152 170 138 V124 Z" fill="#fff" />
        <Path d="M181 140 L188 147 L200 133" fill="none" strokeWidth={3} />
      </G>
      <Path d={sparkle(52, 40, 8)} fill={GOLD} stroke={INK} strokeWidth={1.4} />
    </Svg>
  );
}

/** Empty state: an empty calendar with a broom leaning on it. */
export function EmptyCalendarScene({ size = 150 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.8} viewBox="0 0 150 120">
      <Ellipse cx={75} cy={110} rx={56} ry={6} fill="#ECE6DA" />
      <G {...s}>
        <Rect x={30} y={20} width={80} height={84} rx={10} fill="#fff" />
        <Rect x={30} y={20} width={80} height={22} rx={10} fill={GOLD} />
        <Line x1={50} y1={14} x2={50} y2={28} />
        <Line x1={90} y1={14} x2={90} y2={28} />
        <Line x1={44} y1={60} x2={96} y2={60} strokeDasharray="4 8" />
        <Line x1={44} y1={78} x2={80} y2={78} strokeDasharray="4 8" />
        <Line x1={128} y1={30} x2={110} y2={92} />
        <Path d="M102 88 L118 94 L114 108 L98 102 Z" fill={CREAM} />
      </G>
      <Path d={sparkle(22, 48, 6)} fill={GOLD} stroke={INK} strokeWidth={1.4} />
    </Svg>
  );
}

/** Empty state: a bell at rest. */
export function BellScene({ size = 120 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Circle cx={60} cy={60} r={52} fill="#FBF1DA" />
      <G {...s}>
        <Path d="M38 78 V56 C38 42 47 34 60 34 C73 34 82 42 82 56 V78 L88 84 H32 Z" fill={GOLD} />
        <Path d="M52 88 Q60 98 68 88" fill="none" />
        <Line x1={60} y1={26} x2={60} y2={34} />
      </G>
      <Path d={sparkle(92, 32, 6)} fill={CREAM} stroke={INK} strokeWidth={1.4} />
    </Svg>
  );
}
