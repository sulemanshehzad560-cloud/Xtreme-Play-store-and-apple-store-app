import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { MopLoader } from "./MopLoader";
import { colors, radius, space } from "../lib/theme";
import { STATUS_LABEL } from "../lib/format";
import type { BookingStatus } from "../lib/types";

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const inner = <View style={[{ gap: space(4) }, padded && { padding: space(4) }]}>{children}</View>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top", "left", "right"]}>
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: space(10) }} keyboardShouldPersistTaps="handled">{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

type Variant = "title" | "heading" | "body" | "muted" | "small" | "gold";
export function Text({ variant = "body", style, ...rest }: TextProps & { variant?: Variant }) {
  return <RNText style={[styles.text, styles[variant], style]} {...rest} />;
}

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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: off, busy: loading }}
      onPress={off ? undefined : press}
      style={({ pressed }) => [
        styles.button,
        styles[`btn_${variant}`],
        pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] },
        off && { opacity: 0.5 },
      ]}
    >
      {variant === "primary" ? (
        <LinearGradient
          colors={[colors.goldHi, colors.gold, colors.goldLo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.md }]}
        />
      ) : null}
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.onGold : colors.gold} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
          {icon}
          <RNText style={[styles.buttonText, variant === "primary" ? { color: colors.onGold } : variant === "danger" ? { color: colors.err } : { color: colors.text }]}>
            {title}
          </RNText>
        </View>
      )}
    </Pressable>
  );
}

export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: ViewStyle }) {
  const body = <View style={[styles.card, style]}>{children}</View>;
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: space(1.5) }}>
      {props.label ? <Text variant="small">{props.label}</Text> : null}
      <TextInput placeholderTextColor={colors.faint} {...props} style={[styles.input, props.style]} />
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipOn]} accessibilityState={{ selected }}>
      <RNText style={{ color: selected ? colors.onGold : colors.text, fontWeight: "600" }}>{label}</RNText>
    </Pressable>
  );
}

const STATUS_COLOR: Record<BookingStatus, string> = {
  requested: colors.warn,
  confirmed: colors.info,
  assigned: colors.info,
  en_route: colors.gold,
  arrived: colors.gold,
  in_progress: colors.gold,
  completed: colors.ok,
  cancelled: colors.err,
};

export function StatusPill({ status }: { status: BookingStatus }) {
  return (
    <View style={[styles.pill, { borderColor: STATUS_COLOR[status] }]}>
      <RNText style={{ color: STATUS_COLOR[status], fontSize: 12, fontWeight: "700" }}>{STATUS_LABEL[status]}</RNText>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: space(3) }, style]}>{children}</View>;
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <Text style={{ color: colors.err }}>{error}</Text> : null;
}

/** Full-screen brand loader (app start). */
export function Loading() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: space(6) }}>
      <LinearGradient
        colors={["rgba(226,193,112,0.16)", "rgba(3,4,5,0)"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: "55%" }}
      />
      <View style={{ alignItems: "center", gap: space(1) }}>
        <RNText style={styles.brand}>
          XTREME<RNText style={{ color: colors.text }}>-</RNText>HOME PARTNER
        </RNText>
        <RNText style={{ color: colors.muted, letterSpacing: 2, fontSize: 12 }}>CLEANING · FACILITIES · ABU DHABI</RNText>
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

const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 16 },
  brand: { color: colors.gold, fontSize: 22, fontWeight: "900", letterSpacing: 3 },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: 0.2 },
  heading: { fontSize: 20, fontWeight: "700" },
  body: {},
  muted: { color: colors.muted },
  small: { color: colors.muted, fontSize: 13 },
  gold: { color: colors.gold, fontWeight: "700" },
  button: { minHeight: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: space(5), overflow: "hidden" },
  btn_primary: {
    backgroundColor: colors.gold,
    shadowColor: colors.gold,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  btn_secondary: { backgroundColor: colors.cardHi, borderWidth: 1, borderColor: colors.border },
  btn_ghost: { backgroundColor: "transparent" },
  btn_danger: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.err },
  buttonText: { fontSize: 16, fontWeight: "700" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    gap: space(2),
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 17,
    paddingHorizontal: space(4),
    minHeight: 52,
  },
  chip: { paddingHorizontal: space(4), paddingVertical: space(2.5), borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1), alignSelf: "flex-start" },
});
