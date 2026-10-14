import type { ReactNode } from "react";
import { useState } from "react";
import {
  ActivityIndicator,
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { MopLoader } from "./MopLoader";
import { colors, fonts, radius, shadow, space } from "../lib/theme";
import { STATUS_LABEL } from "../lib/format";
import type { BookingStatus } from "../lib/types";

// ------------------------------------------------------------------ layout

export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ["top", "left", "right"],
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ("top" | "left" | "right" | "bottom")[];
  footer?: ReactNode;
}) {
  const inner = <View style={[{ gap: space(4) }, padded && { padding: space(4) }]}>{children}</View>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ paddingBottom: footer ? space(6) : space(10) }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {inner}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{inner}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: space(3) }, style]}>{children}</View>;
}

/** Bottom bar that stays put while the page scrolls: price on the left, action on the right. */
export function StickyFooter({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space(3)) }]}>{children}</View>;
}

// ------------------------------------------------------------------ text

type Variant = "display" | "title" | "heading" | "subheading" | "body" | "muted" | "small" | "label" | "price";

const WEIGHT: Record<string, string> = { "400": fonts.regular, "500": fonts.medium, "600": fonts.semibold, "700": fonts.bold, "800": fonts.extrabold, "900": fonts.extrabold, bold: fonts.bold };

/** Text on the app's type scale. A `fontWeight` is mapped to the matching font face. */
export function Text({ variant = "body", style, ...rest }: TextProps & { variant?: Variant }) {
  const flat = StyleSheet.flatten([styles.text, styles[variant], style]) as TextStyle;
  if (flat.fontWeight) {
    if (!StyleSheet.flatten(style as TextStyle)?.fontFamily) flat.fontFamily = WEIGHT[String(flat.fontWeight)] ?? flat.fontFamily;
    delete flat.fontWeight;
  }
  return <RNText style={flat} {...rest} />;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <Row style={{ justifyContent: "space-between", marginTop: space(2) }}>
      <Text variant="heading">{title}</Text>
      {action ? (
        <Text onPress={onAction} style={{ color: colors.gold, fontFamily: fonts.bold, fontSize: 14 }}>
          {action}
        </Text>
      ) : null}
    </Row>
  );
}

// ------------------------------------------------------------------ surfaces

export function Card({ children, onPress, style, tone = "plain" }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; tone?: "plain" | "gold" | "ink" }) {
  const toneStyle = tone === "gold" ? styles.cardGold : tone === "ink" ? styles.cardInk : null;
  const body = <View style={[styles.card, toneStyle, style]}>{children}</View>;
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: space(1) }} />;
}

/** Round icon badge with a soft gold background (service and list icons). */
export function IconBadge({ glyph, size = 44, tone = "gold" }: { glyph: string; size?: number; tone?: "gold" | "plain" | "ink" }) {
  const bg = tone === "gold" ? colors.goldSoft : tone === "ink" ? colors.ink : colors.bg;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <RNText style={{ fontSize: size * 0.48 }}>{glyph}</RNText>
    </View>
  );
}

export function Avatar({ name, size = 44 }: { name: string | null | undefined; size?: number }) {
  const initials = (name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.goldLine }}>
      <RNText style={{ color: colors.goldBright, fontFamily: fonts.bold, fontSize: size * 0.36 }}>{initials}</RNText>
    </View>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <RNText style={{ fontSize: size, color: colors.star, letterSpacing: 1 }}>
      {"★".repeat(Math.round(value))}
      <RNText style={{ color: colors.border }}>{"★".repeat(5 - Math.round(value))}</RNText>
    </RNText>
  );
}

/** Settings-style row: icon, title, subtitle, chevron. */
export function ListItem({ icon, title, subtitle, onPress, danger, right }: { icon?: string; title: string; subtitle?: string; onPress?: () => void; danger?: boolean; right?: ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.listItem, pressed && { backgroundColor: colors.surfaceAlt }]}>
      {icon ? <IconBadge glyph={icon} size={38} tone={danger ? "plain" : "gold"} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.semibold, color: danger ? colors.danger : colors.text }}>{title}</Text>
        {subtitle ? <Text variant="small">{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Text style={{ color: colors.faint, fontSize: 22 }}>›</Text> : null)}
    </Pressable>
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
  size = "lg",
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "gold" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  size?: "lg" | "sm";
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  const fg = variant === "primary" ? colors.onInk : variant === "gold" ? colors.ink : variant === "danger" ? colors.danger : variant === "ghost" ? colors.gold : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: off, busy: loading }}
      onPress={
        off
          ? undefined
          : () => {
              void Haptics.selectionAsync().catch(() => undefined);
              onPress();
            }
      }
      style={({ pressed }) => [styles.button, size === "sm" && styles.buttonSm, styles[`btn_${variant}`], pressed && { opacity: 0.85 }, off && { opacity: 0.45 }, style]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Row style={{ gap: space(2) }}>
          {icon}
          <RNText style={{ color: fg, fontFamily: fonts.bold, fontSize: size === "sm" ? 14 : 16 }}>{title}</RNText>
        </Row>
      )}
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string; prefix?: ReactNode }) {
  const [focused, setFocused] = useState(false);
  const { label, prefix, style, ...rest } = props;
  return (
    <View style={{ gap: space(1.5) }}>
      {label ? <Text variant="label">{label}</Text> : null}
      <View style={[styles.inputWrap, focused && { borderColor: colors.gold, backgroundColor: colors.surface }]}>
        {prefix}
        <TextInput
          placeholderTextColor={colors.faint}
          selectionColor={colors.gold}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, style]}
        />
      </View>
    </View>
  );
}

export function Chip({ label, selected, onPress, sub, icon }: { label: string; selected?: boolean; onPress?: () => void; sub?: string; icon?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && { opacity: 0.85 }]}>
      {icon ? <RNText style={{ fontSize: 22, textAlign: "center", marginBottom: 2 }}>{icon}</RNText> : null}
      <RNText style={{ color: colors.text, fontFamily: selected ? fonts.bold : fonts.semibold, fontSize: 14, textAlign: "center" }}>{label}</RNText>
      {sub ? <RNText style={{ color: selected ? colors.gold : colors.muted, fontFamily: fonts.medium, fontSize: 11, textAlign: "center" }}>{sub}</RNText> : null}
    </Pressable>
  );
}

/** A selectable option card with a radio dot (plans, payment methods, addresses). */
export function OptionCard({ selected, onPress, title, subtitle, right, icon, disabled }: { selected: boolean; onPress: () => void; title: string; subtitle?: string; right?: ReactNode; icon?: ReactNode; disabled?: boolean }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      style={[styles.option, selected && styles.optionOn, disabled && { opacity: 0.45 }]}
    >
      <View style={[styles.radio, selected && { borderColor: colors.gold }]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bold }}>{title}</Text>
        {subtitle ? <Text variant="small">{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

const STATUS_TONE: Record<BookingStatus, [string, string]> = {
  requested: [colors.warning, colors.warningSoft],
  confirmed: [colors.info, colors.infoSoft],
  assigned: [colors.info, colors.infoSoft],
  en_route: [colors.gold, colors.goldSoft],
  arrived: [colors.gold, colors.goldSoft],
  in_progress: [colors.gold, colors.goldSoft],
  completed: [colors.success, colors.successSoft],
  cancelled: [colors.danger, colors.dangerSoft],
};

export function StatusPill({ status }: { status: BookingStatus }) {
  const [fg, bg] = STATUS_TONE[status];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} />
      <RNText style={{ color: fg, fontFamily: fonts.bold, fontSize: 12 }}>{STATUS_LABEL[status]}</RNText>
    </View>
  );
}

/** Horizontal progress for multi-step flows. */
export function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <View style={{ gap: space(2) }}>
      <Row style={{ gap: space(1.5) }}>
        {steps.map((_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= current ? colors.gold : colors.border }} />
        ))}
      </Row>
      <Text variant="small">
        Step {current + 1} of {steps.length} · <Text variant="small" style={{ color: colors.text, fontFamily: fonts.semibold }}>{steps[current]}</Text>
      </Text>
    </View>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <View style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: space(3) }}>
      <Text style={{ color: colors.danger, fontSize: 14 }}>{error}</Text>
    </View>
  ) : null;
}

export function Notice({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "info" }) {
  return (
    <View style={{ backgroundColor: tone === "gold" ? colors.goldSoft : colors.infoSoft, borderRadius: radius.md, padding: space(3), borderWidth: 1, borderColor: tone === "gold" ? colors.goldLine : "#CFE0FB" }}>
      <Text style={{ fontSize: 14, color: colors.text }}>{children}</Text>
    </View>
  );
}

// ------------------------------------------------------------------ loading

/** Brand intro shown while the app starts. */
export function Loading() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", gap: space(8) }}>
      <View style={{ alignItems: "center", gap: space(2) }}>
        <RNText style={{ color: colors.goldBright, fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: 0.5 }}>
          Xtreme<RNText style={{ color: colors.onInk }}>-Home Partner</RNText>
        </RNText>
        <RNText style={{ color: "#BDB4A3", fontFamily: fonts.medium, fontSize: 13 }}>Cleaning & facilities services · Abu Dhabi</RNText>
      </View>
      <MopLoader size={1.1} tone="dark" />
    </View>
  );
}

export function InlineLoader({ label }: { label?: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: space(8) }}>
      <MopLoader size={0.65} label={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 16, fontFamily: fonts.regular, lineHeight: 23 },
  display: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 35, letterSpacing: -0.4 },
  title: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 31, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 25 },
  subheading: { fontFamily: fonts.semibold, fontSize: 16 },
  body: {},
  muted: { color: colors.muted },
  small: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  price: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.text },
  footer: {
    backgroundColor: colors.surface,
    paddingHorizontal: space(4),
    paddingTop: space(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    ...shadow.raised,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space(4), gap: space(2), borderWidth: 1, borderColor: colors.border, ...shadow.card },
  cardGold: { backgroundColor: colors.surfaceAlt, borderColor: colors.goldLine },
  cardInk: { backgroundColor: colors.ink, borderColor: colors.ink },
  listItem: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(3), paddingHorizontal: space(1), borderRadius: radius.sm },
  button: { minHeight: 54, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: space(5) },
  buttonSm: { minHeight: 40, paddingHorizontal: space(4), borderRadius: radius.sm },
  btn_primary: { backgroundColor: colors.ink },
  btn_gold: { backgroundColor: colors.goldBright },
  btn_secondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  btn_ghost: { backgroundColor: "transparent", minHeight: 44 },
  btn_danger: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: "#F2C4C4" },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(4), minHeight: 54, gap: space(2) },
  input: { flex: 1, color: colors.text, fontSize: 16, fontFamily: fonts.medium, paddingVertical: space(3) },
  chip: { paddingHorizontal: space(4), paddingVertical: space(2.5), borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, minWidth: 64 },
  chipOn: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  option: { flexDirection: "row", alignItems: "center", gap: space(3), padding: space(4), borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  optionOn: { borderColor: colors.gold, backgroundColor: colors.surfaceAlt },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.faint, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.gold },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1), alignSelf: "flex-start" },
});
