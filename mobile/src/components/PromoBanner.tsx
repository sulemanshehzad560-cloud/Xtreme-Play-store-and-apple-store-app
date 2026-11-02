import type { ReactNode } from "react";
import { Image, Pressable, Text as RNText, View, type ImageSourcePropType } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { ServiceIcon } from "./art/ServiceIcon";
import { fonts, radius, space } from "../lib/theme";
import { isRTL } from "@/lib/i18n";

export interface Promo {
  key: string;
  tag: string;
  title: string;
  body: string;
  cta: string;
  /** Where the banner leads: a service key or "plans". */
  service: string;
  /** The service whose illustration to show, or a custom art element (when there is no photo). */
  art?: string | ReactNode;
  /** A real photo filling the banner; the text sits on a dark fade on the `align` side. */
  photo?: ImageSourcePropType;
  align?: "left" | "right";
  colors: [string, string];
  /** Light banners use dark text. */
  light?: boolean;
  accent: string;
}

const sparkle = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z`;

/** A home-screen offer: gradient card, offer tag, headline, call to action and a lifelike illustration. */
export function PromoBanner({ promo, width, height = 184, onPress }: { promo: Promo; width: number; height?: number; onPress: () => void }) {
  const fg = promo.light ? "#16130E" : "#FFFFFF";
  const sub = promo.light ? "rgba(22,19,14,0.72)" : "rgba(255,255,255,0.78)";
  const id = `pb-${promo.key}`;
  if (promo.photo) return <PhotoBanner promo={promo} width={width} height={height} onPress={onPress} />;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${promo.title}. ${promo.cta}`} style={({ pressed }) => ({ width, height, borderRadius: radius.xl, overflow: "hidden", transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <Svg width={width} height={height} style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={promo.colors[0]} />
            <Stop offset="1" stopColor={promo.colors[1]} />
          </LinearGradient>
          <RadialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={promo.accent} stopOpacity={promo.light ? 0.55 : 0.45} />
            <Stop offset="1" stopColor={promo.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${id}-bg)`} />
        <Circle cx={width - 70} cy={height / 2 + 8} r={110} fill={`url(#${id}-glow)`} />
        <Circle cx={width - 70} cy={height / 2 + 8} r={64} fill="#FFFFFF" opacity={promo.light ? 0.6 : 0.1} />
        <Path d={sparkle(width - 150, 30, 6)} fill={promo.accent} opacity={0.9} />
        <Path d={sparkle(width - 22, height - 34, 4.5)} fill={promo.accent} opacity={0.8} />
        <Path d={sparkle(width - 30, 26, 3.5)} fill="#FFFFFF" opacity={0.7} />
      </Svg>
      <View style={{ position: "absolute", right: 4, top: height / 2 - 66 }}>
        {typeof promo.art === "string" ? <ServiceIcon name={promo.art} size={140} tile={false} /> : promo.art}
      </View>
      <View style={{ padding: space(5), paddingRight: 0, width: "62%", gap: space(1.5), flex: 1 }}>
        <View style={{ alignSelf: "flex-start", backgroundColor: promo.accent, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: 3 }}>
          <RNText style={{ color: "#16130E", fontFamily: fonts.extrabold, fontSize: 10.5, letterSpacing: 0.8 }}>{promo.tag}</RNText>
        </View>
        <RNText style={{ color: fg, fontFamily: fonts.extrabold, fontSize: 19, lineHeight: 23 }} numberOfLines={2}>
          {promo.title}
        </RNText>
        <RNText style={{ color: sub, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17 }} numberOfLines={2}>
          {promo.body}
        </RNText>
      </View>
      <View style={{ position: "absolute", left: space(5), bottom: space(4), backgroundColor: promo.light ? "#16130E" : "#FFFFFF", borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(2) }}>
        <RNText style={{ color: promo.light ? "#FFFFFF" : "#16130E", fontFamily: fonts.bold, fontSize: 13 }}>{promo.cta} {isRTL() ? "←" : "→"}</RNText>
      </View>
    </Pressable>
  );
}

function PhotoBanner({ promo, width, height, onPress }: { promo: Promo; width: number; height: number; onPress: () => void }) {
  const right = promo.align === "right";
  const id = `pp-${promo.key}`;
  const textBox = { position: "absolute" as const, top: 0, bottom: 0, width: "64%" as const, padding: space(5), gap: space(1.5), ...(right ? { right: 0, alignItems: "flex-end" as const } : { left: 0, alignItems: "flex-start" as const }) };
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${promo.title}. ${promo.cta}`} style={({ pressed }) => ({ width, height, borderRadius: radius.xl, overflow: "hidden", backgroundColor: promo.colors[0], transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <Image source={promo.photo!} style={{ position: "absolute", width, height }} resizeMode="cover" />
      <Svg width={width} height={height} style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient id={`${id}-fade`} x1={right ? "1" : "0"} y1="0" x2={right ? "0" : "1"} y2="0">
            <Stop offset="0" stopColor={promo.colors[0]} stopOpacity={0.94} />
            <Stop offset="0.48" stopColor={promo.colors[0]} stopOpacity={0.78} />
            <Stop offset="0.8" stopColor={promo.colors[0]} stopOpacity={0.12} />
            <Stop offset="1" stopColor={promo.colors[0]} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={`${id}-base`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.55" stopColor="#000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.35} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${id}-fade)`} />
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${id}-base)`} />
      </Svg>
      <View style={textBox}>
        <View style={{ backgroundColor: promo.accent, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: 3 }}>
          <RNText style={{ color: "#16130E", fontFamily: fonts.extrabold, fontSize: 10.5, letterSpacing: 0.8 }}>{promo.tag}</RNText>
        </View>
        <RNText style={{ color: "#FFFFFF", fontFamily: fonts.extrabold, fontSize: 19, lineHeight: 23, textAlign: right ? "right" : "left" }} numberOfLines={2}>
          {promo.title}
        </RNText>
        <RNText style={{ color: "rgba(255,255,255,0.85)", fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17, textAlign: right ? "right" : "left" }} numberOfLines={2}>
          {promo.body}
        </RNText>
      </View>
      <View style={{ position: "absolute", bottom: space(4), ...(right ? { right: space(5) } : { left: space(5) }), backgroundColor: "#FFFFFF", borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(2) }}>
        <RNText style={{ color: "#16130E", fontFamily: fonts.bold, fontSize: 13 }}>{promo.cta} {isRTL() ? "←" : "→"}</RNText>
      </View>
    </Pressable>
  );
}
