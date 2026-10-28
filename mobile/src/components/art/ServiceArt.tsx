import type { ReactNode } from "react";
import { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

// Lifelike service illustrations: real-world colours, soft gradients, highlights and a floor
// shadow, drawn in code on a 64 × 64 grid so they stay sharp at any size and weigh nothing.

type Grad = [string, string];

const lin = (id: string, [a, b]: Grad, x2 = 0, y2 = 1) => (
  <LinearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
    <Stop offset="0" stopColor={a} />
    <Stop offset="1" stopColor={b} />
  </LinearGradient>
);

const shadow = (rx = 22, cy = 57) => <Ellipse cx={32} cy={cy} rx={rx} ry={3.2} fill="#000" opacity={0.14} />;

const glint = (x: number, y: number, r = 3, fill = "#FFFFFF") => (
  <Path d={`M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z`} fill={fill} />
);

const ART: Record<string, () => ReactNode> = {
  // Mop and bucket with suds
  regular: () => (
    <>
      <Defs>
        {lin("rg-bucket", ["#5AA2F0", "#2563C9"])}
        {lin("rg-wood", ["#D9A066", "#9A6332"], 1, 0)}
        {lin("rg-mop", ["#FFFFFF", "#D7DCE3"])}
      </Defs>
      {shadow()}
      <Path d="M47 4 L33 46" stroke="url(#rg-wood)" strokeWidth={3.4} strokeLinecap="round" />
      <Path d="M26 44 Q33 40 40 44 L42 54 Q33 57 24 54 Z" fill="url(#rg-mop)" />
      <Path d="M28 46 L27 54 M32 45 L32 55 M36 46 L37 54" stroke="#B9C1CC" strokeWidth={1} />
      <Path d="M8 30 H34 L31 54 Q21 57 11 54 Z" fill="url(#rg-bucket)" />
      <Ellipse cx={21} cy={30} rx={13} ry={3.4} fill="#7DB8F5" />
      <Path d="M10 33 Q21 37 32 33" stroke="#1E4FA3" strokeWidth={1.2} fill="none" opacity={0.5} />
      <Circle cx={14} cy={28} r={3.2} fill="#FFFFFF" />
      <Circle cx={19} cy={26.5} r={3.8} fill="#FFFFFF" />
      <Circle cx={25} cy={27.5} r={3.4} fill="#F2F6FB" />
      <Circle cx={29.5} cy={29} r={2.2} fill="#FFFFFF" />
      <Rect x={13} y={36} width={3} height={14} rx={1.5} fill="#FFFFFF" opacity={0.35} />
      {glint(52, 18, 3.2, "#F5C542")}
      {glint(8, 14, 2.4, "#F5C542")}
    </>
  ),

  // Spray bottle with mist and a microfibre cloth
  deep: () => (
    <>
      <Defs>
        {lin("dp-liquid", ["#4FD1C5", "#1F9E92"])}
        {lin("dp-head", ["#FFFFFF", "#D9DEE5"])}
        {lin("dp-cloth", ["#7ED957", "#3FA34D"])}
      </Defs>
      {shadow(20)}
      <Path d="M36 50 Q44 44 54 48 L56 55 Q46 58 36 55 Z" fill="url(#dp-cloth)" />
      <Path d="M39 51 Q46 48 53 50" stroke="#2E7D32" strokeWidth={0.9} fill="none" opacity={0.6} />
      <Path d="M18 26 H34 L36 32 V52 Q36 56 32 56 H20 Q16 56 16 52 V32 Z" fill="url(#dp-liquid)" />
      <Path d="M17 34 H35" stroke="#FFFFFF" strokeWidth={1} opacity={0.6} />
      <Rect x={19} y={36} width={3} height={16} rx={1.5} fill="#FFFFFF" opacity={0.4} />
      <Rect x={21} y={38} width={10} height={9} rx={2} fill="#FFFFFF" opacity={0.85} />
      <Path d="M24 41.5 H29 M24 44 H28" stroke="#1F9E92" strokeWidth={1.1} strokeLinecap="round" />
      <Rect x={20} y={20} width={12} height={7} rx={1.5} fill="url(#dp-head)" />
      <Path d="M18 13 H36 L40 17 H32 V20 H20 Z" fill="url(#dp-head)" />
      <Path d="M24 20 Q23 26 19 27" stroke="#AEB6C1" strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <Circle cx={45} cy={12} r={1.6} fill="#8FD6F2" />
      <Circle cx={49} cy={16} r={1.9} fill="#8FD6F2" />
      <Circle cx={46} cy={20} r={1.4} fill="#8FD6F2" />
      <Circle cx={52} cy={11} r={1.2} fill="#8FD6F2" />
      {glint(53, 26, 3, "#F5C542")}
    </>
  ),

  // Three-seat fabric sofa with cushions
  sofa: () => (
    <>
      <Defs>
        {lin("sf-back", ["#A9B4C2", "#7C8899"])}
        {lin("sf-seat", ["#C3CCD7", "#97A3B3"])}
        {lin("sf-arm", ["#8E9AAB", "#6C7889"])}
        {lin("sf-pillow", ["#F2C46B", "#D99A2B"])}
      </Defs>
      {shadow(26, 53)}
      <Rect x={11} y={18} width={42} height={20} rx={6} fill="url(#sf-back)" />
      <Path d="M32 19 V37" stroke="#6E7A8B" strokeWidth={1} opacity={0.6} />
      <Rect x={5} y={28} width={11} height={19} rx={5} fill="url(#sf-arm)" />
      <Rect x={48} y={28} width={11} height={19} rx={5} fill="url(#sf-arm)" />
      <Rect x={14} y={34} width={36} height={11} rx={3.5} fill="url(#sf-seat)" />
      <Path d="M32 35 V44" stroke="#7C8899" strokeWidth={1} />
      <Rect x={15} y={35} width={16} height={2} rx={1} fill="#FFFFFF" opacity={0.35} />
      <Path d="M16 24 Q22 20 27 25 Q24 31 18 30 Z" fill="url(#sf-pillow)" />
      <Path d="M48 24 Q42 20 37 25 Q40 31 46 30 Z" fill="#E9EEF3" />
      <Rect x={8} y={47} width={3} height={5} rx={1} fill="#7A4E2D" />
      <Rect x={53} y={47} width={3} height={5} rx={1} fill="#7A4E2D" />
      {glint(55, 12, 3.2, "#F5C542")}
    </>
  ),

  // Quilted mattress with a pillow
  mattress: () => (
    <>
      <Defs>
        {lin("mt-top", ["#FFFFFF", "#E6EBF2"])}
        {lin("mt-side", ["#DDE4EE", "#BCC7D6"])}
        {lin("mt-pillow", ["#FFFFFF", "#DCE3EC"])}
      </Defs>
      {shadow(26, 52)}
      <Path d="M6 32 L18 20 H58 L50 32 Z" fill="url(#mt-top)" stroke="#C9D2DE" strokeWidth={0.8} />
      <Path d="M6 32 H50 V44 H6 Z" fill="url(#mt-side)" />
      <Path d="M50 32 L58 20 V32 L50 44 Z" fill="#AEBACB" />
      <Path d="M6 35 H50 M6 41 H50" stroke="#5B8DEF" strokeWidth={1.2} />
      <Path d="M18 26 L24 20 M28 26 L34 20 M38 26 L44 20 M14 30 L20 24 M24 30 L30 24 M34 30 L40 24 M44 30 L50 24" stroke="#D3DBE6" strokeWidth={0.9} />
      <Path d="M22 21 Q27 15 40 16 Q46 17 46 21 Q40 25 26 25 Q21 25 22 21 Z" fill="url(#mt-pillow)" stroke="#C9D2DE" strokeWidth={0.8} />
      <Rect x={8} y={44} width={3} height={5} rx={1} fill="#8A6A4A" />
      <Rect x={45} y={44} width={3} height={5} rx={1} fill="#8A6A4A" />
      {glint(54, 10, 3.4, "#F5C542")}
      {glint(10, 16, 2.2, "#F5C542")}
    </>
  ),

  // Patterned rug and an upright vacuum
  carpet: () => (
    <>
      <Defs>
        {lin("cp-rug", ["#B5473A", "#8C2F27"])}
        {lin("cp-vac", ["#F15A4A", "#C2382A"])}
        {lin("cp-metal", ["#E3E7EC", "#9AA4B1"], 1, 0)}
      </Defs>
      {shadow(27, 55)}
      <Path d="M4 50 L14 36 H60 L52 50 Z" fill="url(#cp-rug)" />
      <Path d="M8 48 L16 38 H56 L49 48 Z" fill="none" stroke="#E8B95A" strokeWidth={1.4} />
      <Path d="M26 43 L31 40 L36 43 L31 46 Z" fill="#E8B95A" />
      <Path d="M18 43 L21 41 L24 43 L21 45 Z M38 43 L41 41 L44 43 L41 45 Z" fill="#F2D9A0" opacity={0.8} />
      <Path d="M44 6 L40 36" stroke="url(#cp-metal)" strokeWidth={2.6} strokeLinecap="round" />
      <Rect x={41} y={4} width={9} height={4} rx={2} fill="#3B4250" />
      <Path d="M36 22 Q42 18 47 22 L45 38 Q40 40 35 38 Z" fill="url(#cp-vac)" />
      <Rect x={38} y={26} width={6} height={6} rx={2} fill="#FFFFFF" opacity={0.5} />
      <Path d="M30 40 H48 Q50 40 50 42 V44 H28 V42 Q28 40 30 40 Z" fill="#3B4250" />
      <Circle cx={31} cy={45} r={1.8} fill="#1F2430" />
      <Circle cx={47} cy={45} r={1.8} fill="#1F2430" />
      {glint(14, 22, 3, "#F5C542")}
      {glint(22, 14, 2, "#F5C542")}
    </>
  ),

  // Window being cleaned with a squeegee
  glass: () => (
    <>
      <Defs>
        {lin("gl-sky", ["#BFE3FF", "#6FB5F2"])}
        {lin("gl-frame", ["#FFFFFF", "#D7DEE7"])}
        {lin("gl-handle", ["#FFD45E", "#E8A71B"])}
      </Defs>
      {shadow(22)}
      <Rect x={8} y={6} width={40} height={46} rx={3} fill="url(#gl-frame)" />
      <Rect x={12} y={10} width={15} height={18} fill="url(#gl-sky)" />
      <Rect x={29} y={10} width={15} height={18} fill="url(#gl-sky)" />
      <Rect x={12} y={30} width={15} height={18} fill="url(#gl-sky)" />
      <Rect x={29} y={30} width={15} height={18} fill="url(#gl-sky)" />
      <Path d="M14 26 L24 12 M18 27 L26 16 M31 46 L41 32 M35 47 L42 37" stroke="#FFFFFF" strokeWidth={1.6} opacity={0.75} strokeLinecap="round" />
      <Path d="M30 14 Q36 13 42 15 L42 19 Q36 17 30 18 Z" fill="#FFFFFF" opacity={0.55} />
      <Rect x={6} y={52} width={44} height={3} rx={1.5} fill="#CBD3DE" />
      <Path d="M40 22 L56 38" stroke="url(#gl-handle)" strokeWidth={3.6} strokeLinecap="round" />
      <Path d="M33 26 L44 15 L47 18 L36 29 Z" fill="#2F3540" />
      <Path d="M34 27 L45 16" stroke="#6B7280" strokeWidth={1} />
      <Path d="M30 34 Q31 36.5 30 37.5 Q29 36.5 30 34 Z M26 40 Q27 42.5 26 43.5 Q25 42.5 26 40 Z" fill="#4A9BE8" />
      {glint(55, 9, 3.2, "#F5C542")}
    </>
  ),

  // Gleaming stove with a pan and extractor hood
  kitchen: () => (
    <>
      <Defs>
        {lin("kt-steel", ["#F1F4F7", "#AEB7C3"], 1, 1)}
        {lin("kt-hood", ["#DCE2E9", "#9FA9B6"])}
        {lin("kt-pan", ["#3D4452", "#1E222B"])}
      </Defs>
      {shadow(24)}
      <Rect x={4} y={4} width={56} height={26} rx={2} fill="#F3EEE4" />
      <Path d="M4 13 H60 M4 22 H60 M18 4 V13 M32 4 V13 M46 4 V13 M11 13 V22 M25 13 V22 M39 13 V22 M53 13 V22 M18 22 V30 M32 22 V30 M46 22 V30" stroke="#E2DACB" strokeWidth={0.8} />
      <Path d="M20 4 H44 L48 14 H16 Z" fill="url(#kt-hood)" />
      <Rect x={16} y={14} width={32} height={2.4} rx={1} fill="#7D8794" />
      <Rect x={8} y={30} width={48} height={24} rx={3} fill="url(#kt-steel)" />
      <Rect x={8} y={30} width={48} height={5} rx={2} fill="#2B303A" />
      <Rect x={13} y={38} width={38} height={12} rx={2} fill="#2B303A" opacity={0.9} />
      <Rect x={15} y={40} width={10} height={2} rx={1} fill="#FFFFFF" opacity={0.25} />
      <Circle cx={16} cy={32.5} r={1.2} fill="#C9D1DB" />
      <Circle cx={21} cy={32.5} r={1.2} fill="#C9D1DB" />
      <Ellipse cx={30} cy={29} rx={11} ry={3} fill="url(#kt-pan)" />
      <Path d="M41 28.5 H52" stroke="#1E222B" strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M26 24 Q24 21 26 18 M31 23 Q29 20 31 17 M36 24 Q34 21 36 18" stroke="#B9C2CE" strokeWidth={1.4} fill="none" strokeLinecap="round" />
      {glint(52, 44, 2.6, "#FFFFFF")}
      {glint(58, 22, 2.6, "#F5C542")}
    </>
  ),

  // Bathtub with a chrome tap and foam
  bathroom: () => (
    <>
      <Defs>
        {lin("bt-tile", ["#E4F1FB", "#C9E2F5"])}
        {lin("bt-tub", ["#FFFFFF", "#D9E0E9"])}
        {lin("bt-chrome", ["#F4F6F8", "#8D97A5"], 1, 0)}
      </Defs>
      <Rect x={4} y={4} width={56} height={34} rx={3} fill="url(#bt-tile)" />
      <Path d="M4 15 H60 M4 26 H60 M15 4 V38 M26 4 V38 M37 4 V38 M48 4 V38" stroke="#FFFFFF" strokeWidth={1.2} />
      {shadow(26)}
      <Path d="M8 10 V20 Q8 23 11 23 H14" stroke="url(#bt-chrome)" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Ellipse cx={14} cy={23} rx={3.5} ry={1.6} fill="#9AA4B1" />
      <Path d="M13 26 V29 M15 26 V30 M11 26 V28" stroke="#8FD6F2" strokeWidth={1} strokeLinecap="round" />
      <Path d="M4 32 H60 V36 Q60 50 48 52 H16 Q4 50 4 36 Z" fill="url(#bt-tub)" />
      <Rect x={4} y={30} width={56} height={4} rx={2} fill="#FFFFFF" stroke="#D3DAE3" strokeWidth={0.8} />
      <Circle cx={18} cy={29} r={3} fill="#FFFFFF" />
      <Circle cx={23} cy={27.5} r={3.6} fill="#FFFFFF" />
      <Circle cx={28.5} cy={28.5} r={2.6} fill="#F3F7FB" />
      <Circle cx={40} cy={28} r={3.2} fill="#FFFFFF" />
      <Circle cx={45} cy={29} r={2.4} fill="#F3F7FB" />
      <Rect x={14} y={52} width={3} height={4} rx={1} fill="#B38B4D" />
      <Rect x={47} y={52} width={3} height={4} rx={1} fill="#B38B4D" />
      <Path d="M10 40 Q14 46 22 47" stroke="#FFFFFF" strokeWidth={1.6} fill="none" opacity={0.9} />
      {glint(54, 14, 3, "#F5C542")}
    </>
  ),

  // Balcony with glass railing and a potted plant
  balcony: () => (
    <>
      <Defs>
        {lin("bc-sky", ["#9FD3FF", "#E6F4FF"])}
        {lin("bc-glass", ["#D6EEFF", "#9CCBF0"], 1, 1)}
        {lin("bc-pot", ["#D9824B", "#A65428"])}
        {lin("bc-floor", ["#D8CBB5", "#B8A88E"])}
      </Defs>
      <Rect x={4} y={4} width={56} height={40} rx={3} fill="url(#bc-sky)" />
      <Circle cx={48} cy={13} r={5} fill="#FFE08A" />
      <Path d="M6 30 Q14 24 22 30 Q30 22 38 30 Z" fill="#FFFFFF" opacity={0.8} />
      <Path d="M4 44 H60 L56 56 H8 Z" fill="url(#bc-floor)" />
      <Rect x={6} y={28} width={52} height={17} fill="url(#bc-glass)" opacity={0.85} />
      <Path d="M12 30 L18 43 M24 30 L28 39" stroke="#FFFFFF" strokeWidth={1.4} opacity={0.7} />
      <Rect x={5} y={26} width={54} height={3} rx={1.5} fill="#5C6675" />
      <Path d="M6 28 V45 M32 28 V45 M58 28 V45" stroke="#5C6675" strokeWidth={2} />
      <Path d="M40 44 H52 L50 54 H42 Z" fill="url(#bc-pot)" />
      <Path d="M46 44 Q38 34 41 26 Q46 33 46 44 Q47 31 54 27 Q55 37 46 44" fill="#3FA34D" />
      <Path d="M46 44 Q44 36 46 30" stroke="#2E7D32" strokeWidth={1} fill="none" />
      {glint(14, 12, 2.6, "#FFFFFF")}
    </>
  ),

  // Wooden wardrobe with an open door and hanging clothes
  wardrobe: () => (
    <>
      <Defs>
        {lin("wd-wood", ["#C99A6A", "#8F5F35"], 1, 0)}
        {lin("wd-inside", ["#5A3E28", "#3E2A1B"])}
        {lin("wd-door", ["#DDB088", "#A87445"], 1, 0)}
      </Defs>
      {shadow(22)}
      <Rect x={12} y={6} width={36} height={48} rx={2} fill="url(#wd-wood)" />
      <Rect x={15} y={9} width={30} height={42} rx={1} fill="url(#wd-inside)" />
      <Path d="M17 14 H43" stroke="#C9D1DB" strokeWidth={1.4} />
      <Path d="M20 14 V18 L17 22 V40 H24 V22 Z" fill="#5B8DEF" />
      <Path d="M27 14 V18 L24 22 V44 H31 V22 Z" fill="#F2F4F7" />
      <Path d="M34 14 V18 L31 22 V38 H38 V22 Z" fill="#E36B5D" />
      <Path d="M40 14 V18 L38 22 V42 H43 V22 Z" fill="#F2C46B" />
      <Path d="M48 6 L58 9 V51 L48 54 Z" fill="url(#wd-door)" />
      <Rect x={50} y={28} width={1.6} height={7} rx={0.8} fill="#E8C55A" />
      <Rect x={15} y={46} width={30} height={5} fill="#6B4A30" />
      <Path d="M18 6 V54" stroke="#FFFFFF" strokeWidth={0.8} opacity={0.15} />
      {glint(8, 12, 3, "#F5C542")}
    </>
  ),

  // Commercial kitchen: steel counter, stockpot and chef's hat
  restaurant: () => (
    <>
      <Defs>
        {lin("rs-steel", ["#F2F5F8", "#A3ADBA"], 1, 1)}
        {lin("rs-pot", ["#E6EAEF", "#8E98A6"], 1, 0)}
        {lin("rs-cloche", ["#FFFFFF", "#B9C2CE"], 1, 1)}
      </Defs>
      {shadow(26)}
      <Rect x={4} y={38} width={56} height={6} rx={1.5} fill="url(#rs-steel)" />
      <Rect x={7} y={44} width={3} height={10} fill="#9AA4B1" />
      <Rect x={54} y={44} width={3} height={10} fill="#9AA4B1" />
      <Rect x={10} y={50} width={44} height={2} fill="#B5BEC9" />
      <Rect x={8} y={20} width={20} height={18} rx={2} fill="url(#rs-pot)" />
      <Rect x={6} y={18} width={24} height={3.4} rx={1.7} fill="#7D8794" />
      <Path d="M8 25 H5 M28 25 H31" stroke="#7D8794" strokeWidth={2.4} strokeLinecap="round" />
      <Rect x={10} y={24} width={3} height={12} rx={1.5} fill="#FFFFFF" opacity={0.45} />
      <Path d="M14 15 Q12 11 14 7 M20 15 Q18 11 20 7 M26 15 Q24 11 26 7" stroke="#C3CBD5" strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Path d="M34 37 Q34 22 46 22 Q58 22 58 37 Z" fill="url(#rs-cloche)" />
      <Rect x={32} y={36} width={28} height={2.6} rx={1.3} fill="#8E98A6" />
      <Circle cx={46} cy={20.5} r={2} fill="#8E98A6" />
      <Path d="M38 33 Q38 26 44 25" stroke="#FFFFFF" strokeWidth={1.8} fill="none" strokeLinecap="round" />
      {glint(56, 10, 3, "#F5C542")}
    </>
  ),

  // White kitchen cabinets over a wooden worktop
  cupboard: () => (
    <>
      <Defs>
        {lin("cb-door", ["#FFFFFF", "#DCE2EA"], 1, 1)}
        {lin("cb-top", ["#D7A46D", "#A86F3B"])}
        {lin("cb-wall", ["#F6F1E8", "#E9E0D0"])}
      </Defs>
      <Rect x={4} y={4} width={56} height={52} rx={3} fill="url(#cb-wall)" />
      {shadow(26)}
      <Rect x={6} y={6} width={25} height={20} rx={1.5} fill="url(#cb-door)" stroke="#CDD5DF" strokeWidth={0.8} />
      <Rect x={33} y={6} width={25} height={20} rx={1.5} fill="#6E4B2E" />
      <Rect x={35} y={8} width={21} height={16} fill="#5A3C24" />
      <Path d="M35 16 H56" stroke="#C9D1DB" strokeWidth={1} />
      <Rect x={37} y={10} width={4} height={6} rx={1} fill="#F2C46B" />
      <Rect x={43} y={11} width={4} height={5} rx={1} fill="#E36B5D" />
      <Rect x={49} y={10} width={5} height={6} rx={1} fill="#9AD0F5" />
      <Circle cx={39} cy={21} r={2.4} fill="#FFFFFF" />
      <Rect x={44} y={18} width={8} height={5} rx={1} fill="#7ED957" />
      <Rect x={27} y={12} width={1.6} height={7} rx={0.8} fill="#9AA4B1" />
      <Rect x={4} y={34} width={56} height={4} rx={1} fill="url(#cb-top)" />
      <Rect x={6} y={38} width={25} height={17} rx={1.5} fill="url(#cb-door)" stroke="#CDD5DF" strokeWidth={0.8} />
      <Rect x={33} y={38} width={25} height={17} rx={1.5} fill="url(#cb-door)" stroke="#CDD5DF" strokeWidth={0.8} />
      <Rect x={27} y={42} width={1.6} height={6} rx={0.8} fill="#9AA4B1" />
      <Rect x={35.4} y={42} width={1.6} height={6} rx={0.8} fill="#9AA4B1" />
      <Path d="M9 9 L15 22 M38 41 L42 50" stroke="#FFFFFF" strokeWidth={1.4} opacity={0.8} />
      {glint(30, 30, 2.6, "#F5C542")}
    </>
  ),
};

export const hasServiceArt = (name: string) => name in ART;

/** The lifelike illustration for a service, on its 64 × 64 grid (no tile). */
export function ServiceArt({ name }: { name: string }) {
  const draw = ART[name];
  return draw ? <G>{draw()}</G> : null;
}

/** Soft round backdrop for the illustration. */
export function ArtTile({ light, dark }: { light: string; dark: string }) {
  return (
    <>
      <Defs>
        <RadialGradient id="art-tile" cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor={light} />
          <Stop offset="1" stopColor={dark} />
        </RadialGradient>
      </Defs>
      <Circle cx={32} cy={32} r={32} fill="url(#art-tile)" />
    </>
  );
}

