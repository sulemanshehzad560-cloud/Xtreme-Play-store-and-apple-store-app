import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";

// Xtreme service illustrations: one consistent duotone style (ink outline, gold and
// cream fills) drawn in code, so they stay sharp at any size and weigh nothing.

const INK = "#16130E";
const GOLD = "#E2C170";
const CREAM = "#FFF6DF";
const SW = 2.2;

/** Four-point sparkle centred on (x, y). */
export const sparkle = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z`;

const drop = (x: number, y: number, s = 1) => `M${x} ${y - 6 * s} Q${x + 5 * s} ${y + 1 * s} ${x} ${y + 4 * s} Q${x - 5 * s} ${y + 1 * s} ${x} ${y - 6 * s} Z`;

const common = { stroke: INK, strokeWidth: SW, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function Glyph({ name }: { name: string }) {
  switch (name) {
    case "regular": // broom
      return (
        <G {...common}>
          <Line x1={36} y1={5} x2={23} y2={27} />
          <Path d="M15 25 L29 30 L24 43 L8 37 Z" fill={GOLD} />
          <Line x1={13} y1={31} x2={11} y2={37} />
          <Line x1={18} y1={33} x2={16} y2={39} />
          <Line x1={23} y1={35} x2={21} y2={41} />
          <Path d={sparkle(39, 31, 4)} fill={GOLD} strokeWidth={1.4} />
        </G>
      );
    case "deep": // spray bottle
      return (
        <G {...common}>
          <Rect x={13} y={21} width={17} height={22} rx={4} fill={GOLD} />
          <Rect x={17} y={15} width={9} height={6} fill={CREAM} />
          <Path d="M14 15 V10 H31 L33 13" fill={CREAM} />
          <Circle cx={38} cy={8} r={1.6} fill={INK} stroke="none" />
          <Circle cx={41} cy={13} r={1.6} fill={INK} stroke="none" />
          <Circle cx={38} cy={18} r={1.6} fill={INK} stroke="none" />
          <Line x1={17} y1={29} x2={26} y2={29} stroke={CREAM} />
          <Circle cx={40} cy={34} r={3.5} fill={CREAM} strokeWidth={1.6} />
        </G>
      );
    case "move": // box
      return (
        <G {...common}>
          <Path d="M8 19 L24 13 L40 19 L24 25 Z" fill={CREAM} />
          <Path d="M8 19 L24 25 V43 L8 36 Z" fill={GOLD} />
          <Path d="M24 25 L40 19 V36 L24 43 Z" fill={CREAM} />
          <Path d="M16 16 L32 22 V28" />
        </G>
      );
    case "postcon": // hard hat
      return (
        <G {...common}>
          <Path d="M10 31 Q10 14 24 14 Q38 14 38 31 Z" fill={GOLD} />
          <Rect x={6} y={30} width={36} height={6} rx={3} fill={CREAM} />
          <Path d="M20 15 V30 M28 15 V30" />
          <Path d={sparkle(40, 10, 4)} fill={GOLD} strokeWidth={1.4} />
        </G>
      );
    case "kitbath": // tap with drops
      return (
        <G {...common}>
          <Rect x={7} y={16} width={7} height={10} rx={2} fill={CREAM} />
          <Path d="M14 19 H30 Q36 19 36 25 V28" fill="none" strokeWidth={4} stroke={GOLD} />
          <Path d="M14 19 H30 Q36 19 36 25 V28" fill="none" />
          <Rect x={18} y={11} width={9} height={4} rx={2} fill={GOLD} />
          <Path d={drop(36, 36)} fill={GOLD} />
          <Path d={drop(36, 45, 0.6)} fill={CREAM} strokeWidth={1.6} />
        </G>
      );
    case "carpet": // sofa
      return (
        <G {...common}>
          <Rect x={10} y={13} width={28} height={15} rx={5} fill={GOLD} />
          <Rect x={5} y={22} width={9} height={15} rx={4} fill={CREAM} />
          <Rect x={34} y={22} width={9} height={15} rx={4} fill={CREAM} />
          <Rect x={13} y={27} width={22} height={9} rx={2} fill={CREAM} />
          <Line x1={10} y1={37} x2={10} y2={42} />
          <Line x1={38} y1={37} x2={38} y2={42} />
        </G>
      );
    case "ac": // AC unit with cool air
      return (
        <G {...common}>
          <Rect x={5} y={8} width={38} height={15} rx={4} fill={CREAM} />
          <Line x1={9} y1={19} x2={39} y2={19} />
          <Circle cx={37} cy={13} r={1.5} fill={GOLD} stroke="none" />
          <Path d="M11 30 q4 3 8 0 t8 0 t8 0" stroke={GOLD} strokeWidth={2.6} fill="none" />
          <Path d="M15 38 q4 3 8 0 t8 0" stroke={GOLD} strokeWidth={2.6} fill="none" />
        </G>
      );
    case "pest": // bug with "no" sign
      return (
        <G {...common}>
          <Line x1={16} y1={22} x2={10} y2={19} />
          <Line x1={16} y1={28} x2={9} y2={29} />
          <Line x1={32} y1={22} x2={38} y2={19} />
          <Line x1={32} y1={28} x2={39} y2={29} />
          <Ellipse cx={24} cy={27} rx={8} ry={10} fill={GOLD} />
          <Circle cx={24} cy={15} r={4.5} fill={CREAM} />
          <Line x1={24} y1={18} x2={24} y2={37} />
          <Circle cx={24} cy={25} r={19} fill="none" stroke="#C0392B" strokeWidth={2.6} />
          <Line x1={11} y1={12} x2={37} y2={38} stroke="#C0392B" strokeWidth={2.6} />
        </G>
      );
    case "tank": // water tank
      return (
        <G {...common}>
          <Path d="M12 12 V36 Q24 42 36 36 V12" fill={CREAM} />
          <Ellipse cx={24} cy={12} rx={12} ry={4} fill={GOLD} />
          <Path d={drop(24, 27, 1.1)} fill={GOLD} />
          <Line x1={15} y1={39} x2={13} y2={45} />
          <Line x1={33} y1={39} x2={35} y2={45} />
        </G>
      );
    case "facade": // building with squeegee
      return (
        <G {...common}>
          <Rect x={7} y={7} width={22} height={36} rx={2} fill={CREAM} />
          {[12, 20, 28].map((y) =>
            [11, 19].map((x) => <Rect key={`${x}-${y}`} x={x} y={y} width={6} height={5} fill={GOLD} strokeWidth={1.4} />),
          )}
          <Line x1={42} y1={19} x2={35} y2={29} />
          <Line x1={30} y1={27} x2={39} y2={33} strokeWidth={4} />
          <Path d={sparkle(40, 9, 4)} fill={GOLD} strokeWidth={1.4} />
        </G>
      );
    case "kitchenex": // cooker hood over a pan
      return (
        <G {...common}>
          <Rect x={20} y={4} width={8} height={7} fill={CREAM} />
          <Path d="M14 11 H34 L41 22 H7 Z" fill={GOLD} />
          <Path d="M18 27 q2 -3 0 -5 M24 27 q2 -3 0 -5 M30 27 q2 -3 0 -5" fill="none" strokeWidth={1.6} />
          <Path d="M13 34 H35 Q35 41 24 41 Q13 41 13 34 Z" fill={CREAM} />
          <Line x1={35} y1={35} x2={43} y2={33} />
        </G>
      );
    case "laundry": // washing machine
      return (
        <G {...common}>
          <Rect x={9} y={5} width={30} height={38} rx={5} fill={CREAM} />
          <Line x1={9} y1={13} x2={39} y2={13} />
          <Circle cx={15} cy={9} r={1.4} fill={INK} stroke="none" />
          <Circle cx={20} cy={9} r={1.4} fill={INK} stroke="none" />
          <Circle cx={24} cy={28} r={10} fill={GOLD} />
          <Path d="M17 29 q3.5 -3 7 0 t7 0" fill="none" stroke={CREAM} />
        </G>
      );
    case "drapery": // curtains
      return (
        <G {...common}>
          <Line x1={5} y1={7} x2={43} y2={7} />
          <Path d="M8 7 Q15 24 8 42 H20 Q15 24 21 7 Z" fill={GOLD} />
          <Path d="M40 7 Q33 24 40 42 H28 Q33 24 27 7 Z" fill={CREAM} />
          <Line x1={10} y1={27} x2={19} y2={27} />
          <Line x1={29} y1={27} x2={38} y2={27} />
        </G>
      );
    case "helper": // caring hands / heart
      return (
        <G {...common}>
          <Path d="M24 37 C11 28 8 19 15 14 C19 11 23 14 24 17 C25 14 29 11 33 14 C40 19 37 28 24 37 Z" fill={GOLD} />
          <Path d="M6 32 Q12 40 24 43 Q36 40 42 32" fill="none" />
          <Path d={sparkle(39, 9, 4)} fill={GOLD} strokeWidth={1.4} />
        </G>
      );
    case "fm": // gear and wrench
      return (
        <G {...common}>
          <Circle cx={19} cy={21} r={11} fill="none" strokeWidth={5} strokeDasharray="4.2 3.2" />
          <Circle cx={19} cy={21} r={8.5} fill={GOLD} />
          <Circle cx={19} cy={21} r={3} fill={CREAM} />
          <Line x1={30} y1={32} x2={41} y2={43} strokeWidth={5} />
          <Circle cx={29} cy={31} r={4.5} fill={CREAM} />
        </G>
      );
    case "disinfect": // shield with cross
      return (
        <G {...common}>
          <Path d="M24 5 L39 11 V22 C39 32 32 39 24 43 C16 39 9 32 9 22 V11 Z" fill={GOLD} />
          <Path d="M21 15 H27 V21 H33 V27 H27 V33 H21 V27 H15 V21 H21 Z" fill={CREAM} strokeWidth={1.6} />
        </G>
      );
    default:
      return (
        <G {...common}>
          <Path d={sparkle(24, 24, 14)} fill={GOLD} />
          <Path d={sparkle(38, 10, 5)} fill={CREAM} strokeWidth={1.4} />
        </G>
      );
  }
}

/** Service illustration on a soft round tile. */
export function ServiceIcon({ name, size = 48, tile = true }: { name: string; size?: number; tile?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {tile ? <Circle cx={24} cy={24} r={24} fill="#FBF1DA" /> : null}
      <G transform={tile ? "translate(6 6) scale(0.75)" : undefined}>
        <Glyph name={name} />
      </G>
    </Svg>
  );
}
