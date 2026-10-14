import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import * as Haptics from "expo-haptics";
import { Backdrop } from "./Backdrop";
import { MopLoader } from "./MopLoader";
import { colors, fonts, glow, gradients, radius, space } from "../lib/theme";
import { STATUS_LABEL } from "../lib/format";
import type { BookingStatus } from "../lib/types";

// ------------------------------------------------------------------ layout

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const inner = <View style={[{ gap: space(4) }, padded && { padding: space(4) }]}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        {scroll ? (
          <ScrollView contentContainerStyle={{ paddingBottom: space(28) }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {inner}
          </ScrollView>
        ) : (
          inner
        )}
      </SafeAreaView>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: space(3) }, style]}>{children}</View>;
}

// ------------------------------------------------------------------ text

type Variant = "title" | "heading" | "body" | "muted" | "small" | "gold" | "label";

const WEIGHT_FONT: Record<string, string> = {
  "500": fonts.bodyMedium,
  "600": fonts.bodySemi,
  "700": fonts.bodyBold,
  "800": fonts.bodyBold,
  "900": fonts.bodyBold,
  bold: fonts.bodyBold,
};

/**
 * Text with the app's type scale. Custom fonts carry their own weight, so a
 * `fontWeight` passed by a screen is translated into the matching Exo 2 face.
 */
export function Text({ variant = "body", style, children, ...rest }: TextProps & { variant?: Variant }) {
  const flat = StyleSheet.flatten([styles.text, styles[variant], style]) as TextStyle;
  if (flat.fontWeight && !StyleSheet.flatten(style as TextStyle)?.fontFamily && variant !== "title" && variant !== "heading" && variant !== "gold" && variant !== "label") {
    flat.fontFamily = WEIGHT_FONT[String(flat.fontWeight)] ?? flat.fontFamily;
  }
  delete flat.fontWeight;
  if (variant === "title") return <GradientText style={flat}>{children}</GradientText>;
  return (
    <RNText style={flat} {...rest}>
      {children}
    </RNText>
  );
}

/** Text filled with a gold gradient. */
export function GradientText({ children, style, colors: palette = gradients.title }: { children: ReactNode; style?: StyleProp<TextStyle>; colors?: readonly [string, string, ...string[]] }) {
  return (
    <MaskedView maskElement={<RNText style={style}>{children}</RNText>}>
      <LinearGradient colors={palette} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <RNText style={[style, { opacity: 0 }]}>{children}</RNText>
      </LinearGradient>
    </MaskedView>
  );
}

/** "XTREME-HOME PARTNER" wordmark with a soft gold glow. */
export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <RNText style={[{ fontFamily: fonts.displayBlack, fontSize: size, letterSpacing: size * 0.14, color: colors.gold }, glow(colors.goldGlow, 14)]}>
      XTREME<RNText style={{ color: colors.cyan }}>-</RNText>HOME PARTNER
    </RNText>
  );
}

/** HUD-style section label: small caps, wide spacing, a fading rule after it. */
export function SectionLabel({ children }: { children: string }) {
  return (
    <Row style={{ gap: space(2) }}>
      <View style={{ width: 6, height: 6, backgroundColor: colors.cyan, transform: [{ rotate: "45deg" }], ...glowBox(colors.cyan) }} />
      <RNText style={[styles.label, { color: colors.goldHi }]}>{children.toUpperCase()}</RNText>
      <LinearGradient colors={["rgba(226,193,112,0.5)", "rgba(226,193,112,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, height: 1 }} />
    </Row>
  );
}

// ------------------------------------------------------------------ surfaces

/** Glass panel with a gold-to-cyan hairline border and HUD corner brackets. */
export function Card({ children, onPress, style, hud = true }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; hud?: boolean }) {
  const body = (
    <LinearGradient colors={gradients.border} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.cardBorder, style]}>
      <View style={styles.cardInner}>
        {children}
        {hud ? <Corners /> : null}
      </View>
    </LinearGradient>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] }}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

function Corners() {
  const c = { position: "absolute" as const, width: 12, height: 12, borderColor: colors.cyan, opacity: 0.7 };
  return (
    <>
      <View pointerEvents="none" style={[c, { top: 6, left: 6, borderTopWidth: 1.5, borderLeftWidth: 1.5 }]} />
      <View pointerEvents="none" style={[c, { top: 6, right: 6, borderTopWidth: 1.5, borderRightWidth: 1.5 }]} />
      <View pointerEvents="none" style={[c, { bottom: 6, left: 6, borderBottomWidth: 1.5, borderLeftWidth: 1.5 }]} />
      <View pointerEvents="none" style={[c, { bottom: 6, right: 6, borderBottomWidth: 1.5, borderRightWidth: 1.5 }]} />
    </>
  );
}

// ------------------------------------------------------------------ controls

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const off = disabled || loading;
  const press = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onPress();
  };
  const textColor = variant === "primary" ? colors.onGold : variant === "danger" ? colors.err : variant === "secondary" ? colors.cyan : colors.gold;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: off, busy: loading }}
      onPress={off ? undefined : press}
      style={({ pressed }) => [
        styles.button,
        styles[`btn_${variant}`],
        pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
        off && { opacity: 0.45 },
      ]}
    >
      {variant === "primary" ? (
        <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.md }]} />
      ) : null}
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
          {icon}
          <RNText
            style={[
              variant === "ghost" ? styles.ghostText : styles.buttonText,
              { color: textColor },
              variant === "secondary" && glow(colors.cyanGlow, 8),
            ]}
          >
            {variant === "ghost" ? title : title.toUpperCase()}
          </RNText>
        </View>
      )}
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space(1.5) }}>
      {props.label ? <RNText style={styles.inputLabel}>{props.label.toUpperCase()}</RNText> : null}
      <TextInput
        placeholderTextColor={colors.faint}
        selectionColor={colors.cyan}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[styles.input, focused && styles.inputFocused, props.style]}
      />
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && { opacity: 0.85 }]}>
      {selected ? <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]} /> : null}
      <RNText style={{ color: selected ? colors.onGold : colors.text, fontFamily: selected ? fonts.bodyBold : fonts.bodySemi, fontSize: 14 }}>{label}</RNText>
    </Pressable>
  );
}

const STATUS_COLOR: Record<BookingStatus, string> = {
  requested: colors.warn,
  confirmed: colors.info,
  assigned: colors.cyan,
  en_route: colors.gold,
  arrived: colors.gold,
  in_progress: colors.gold,
  completed: colors.ok,
  cancelled: colors.err,
};

/** Status chip with a glowing dot that pulses while the job is live. */
export function StatusPill({ status }: { status: BookingStatus }) {
  const c = STATUS_COLOR[status];
  const live = status === "en_route" || status === "arrived" || status === "in_progress";
  return (
    <View style={[styles.pill, { borderColor: c, backgroundColor: `${c}14` }]}>
      <Pulse color={c} active={live} />
      <RNText style={{ color: c, fontFamily: fonts.displayMedium, fontSize: 10, letterSpacing: 1.2 }}>{STATUS_LABEL[status].toUpperCase()}</RNText>
    </View>
  );
}

export function Pulse({ color, active = true, size = 7 }: { color: string; active?: boolean; size?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [active]);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {active ? (
        <Animated.View
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size,
            backgroundColor: color,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] }) }],
          }}
        />
      ) : null}
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color, ...glowBox(color) }} />
    </View>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <Text style={{ color: colors.err }}>{error}</Text> : null;
}

// ------------------------------------------------------------------ loading

/** Full-screen brand loader (app start). */
export function Loading() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: space(6) }}>
      <Backdrop intense />
      <View style={{ alignItems: "center", gap: space(2) }}>
        <Wordmark size={21} />
        <RNText style={{ color: colors.cyan, letterSpacing: 4, fontSize: 11, fontFamily: fonts.displayMedium }}>CLEANING · FACILITIES · ABU DHABI</RNText>
      </View>
      <MopLoader size={1.15} />
    </View>
  );
}

/** In-page loader for screens that are fetching data. */
export function InlineLoader({ label }: { label?: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: space(10) }}>
      <MopLoader size={0.7} label={label} />
    </View>
  );
}

const glowBox = (color: string) => ({ shadowColor: color, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } });

const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 16, fontFamily: fonts.body, lineHeight: 22 },
  title: { fontFamily: fonts.display, fontSize: 25, lineHeight: 32, letterSpacing: 0.8 },
  heading: { fontFamily: fonts.display, fontSize: 17, lineHeight: 24, letterSpacing: 0.6, color: colors.text },
  body: {},
  muted: { color: colors.muted },
  small: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  gold: { fontFamily: fonts.displayMedium, color: colors.gold, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase" },
  label: { fontFamily: fonts.displayMedium, fontSize: 11, letterSpacing: 2.5, color: colors.cyan },
  button: { minHeight: 54, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: space(5), overflow: "hidden" },
  btn_primary: { shadowColor: colors.gold, shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  btn_secondary: { backgroundColor: "rgba(90,216,234,0.06)", borderWidth: 1, borderColor: "rgba(90,216,234,0.55)" },
  btn_ghost: { backgroundColor: "transparent", minHeight: 44 },
  btn_danger: { backgroundColor: "rgba(255,107,97,0.06)", borderWidth: 1, borderColor: colors.err },
  buttonText: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 1.6 },
  ghostText: { fontFamily: fonts.bodySemi, fontSize: 15 },
  cardBorder: { borderRadius: radius.lg, padding: 1, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  cardInner: { backgroundColor: colors.glass, borderRadius: radius.lg - 1, padding: space(4), gap: space(2) },
  inputLabel: { fontFamily: fonts.displayMedium, fontSize: 10, letterSpacing: 2, color: colors.muted },
  input: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 17,
    fontFamily: fonts.bodyMedium,
    paddingHorizontal: space(4),
    minHeight: 54,
  },
  inputFocused: { borderColor: colors.cyan, shadowColor: colors.cyan, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  chip: {
    paddingHorizontal: space(4),
    paddingVertical: space(2.5),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.glass,
    overflow: "hidden",
  },
  chipOn: { borderColor: colors.goldHi, shadowColor: colors.gold, shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1), alignSelf: "flex-start" },
});
