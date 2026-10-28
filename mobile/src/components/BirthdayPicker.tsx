import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text as RNText, View } from "react-native";
import { Button, Text } from "./ui";
import { colors, fonts, radius, space } from "../lib/theme";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MIN_AGE = 13;

const pad = (n: number) => String(n).padStart(2, "0");
export const formatDob = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${new Date(y!, m! - 1, d!).toLocaleDateString("en-GB", { month: "long" })} ${y}`;
};

/**
 * Date-of-birth field: opens a calendar where the customer jumps to the year and month,
 * then taps the day. Value is "YYYY-MM-DD".
 */
export function BirthdayPicker({ value, onChange, label = "Date of birth" }: { value: string | null; onChange: (iso: string) => void; label?: string }) {
  const latest = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - MIN_AGE);
    return d;
  }, []);
  const initial = value ? value.split("-").map(Number) : [latest.getFullYear() - 17, 1, 1];
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"day" | "month" | "year">("day");
  const [year, setYear] = useState(initial[0]!);
  const [month, setMonth] = useState(initial[1]! - 1);
  const [picked, setPicked] = useState<string | null>(value);

  const years = useMemo(() => Array.from({ length: 100 }, (_, i) => latest.getFullYear() - i), [latest]);
  const cells = useMemo(() => {
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  }, [year, month]);
  const tooYoung = (d: number) => new Date(year, month, d) > latest;

  function step(delta: number) {
    const m = month + delta;
    const y = year + Math.floor(m / 12);
    if (y > latest.getFullYear() || y < years.at(-1)!) return;
    setYear(y);
    setMonth(((m % 12) + 12) % 12);
  }

  return (
    <View style={{ gap: space(1.5) }}>
      <Text variant="label">{label}</Text>
      <Pressable
        onPress={() => {
          setMode(value ? "day" : "year");
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}: ${formatDob(value)}` : `Choose your ${label.toLowerCase()}`}
        style={{ flexDirection: "row", alignItems: "center", gap: space(3), borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: space(4), height: 52 }}
      >
        <RNText style={{ fontSize: 18 }}>🎂</RNText>
        <RNText style={{ flex: 1, fontFamily: value ? fonts.semibold : fonts.medium, fontSize: 15.5, color: value ? colors.text : colors.faint }}>{value ? formatDob(value) : "Choose on the calendar"}</RNText>
        <RNText style={{ color: colors.gold, fontFamily: fonts.bold, fontSize: 14 }}>📅</RNText>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(10,8,5,0.55)", justifyContent: "center", padding: space(5) }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: space(4), gap: space(3) }}>
            <Text variant="heading">{label}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              {mode === "day" ? <Nav label="‹" onPress={() => step(-1)} /> : <View style={{ width: 40 }} />}
              <View style={{ flexDirection: "row", gap: space(2) }}>
                <Pill label={MONTHS[month]!} active={mode === "month"} onPress={() => setMode(mode === "month" ? "day" : "month")} />
                <Pill label={String(year)} active={mode === "year"} onPress={() => setMode(mode === "year" ? "day" : "year")} />
              </View>
              {mode === "day" ? <Nav label="›" onPress={() => step(1)} /> : <View style={{ width: 40 }} />}
            </View>

            {mode === "year" ? (
              <ScrollView style={{ height: 280 }} contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap" }}>
                {years.map((y) => (
                  <Cell key={y} label={String(y)} width="25%" selected={y === year} onPress={() => (setYear(y), setMode("month"))} />
                ))}
              </ScrollView>
            ) : mode === "month" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {MONTHS.map((m, i) => (
                  <Cell key={m} label={m} width="33.33%" selected={i === month} disabled={new Date(year, i, 1) > latest} onPress={() => (setMonth(i), setMode("day"))} />
                ))}
              </View>
            ) : (
              <View>
                <View style={{ flexDirection: "row" }}>
                  {WEEK.map((w) => (
                    <RNText key={w} style={{ width: `${100 / 7}%`, textAlign: "center", color: colors.faint, fontFamily: fonts.semibold, fontSize: 12 }}>
                      {w}
                    </RNText>
                  ))}
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {cells.map((d, i) =>
                    d == null ? (
                      <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 42 }} />
                    ) : (
                      <Cell
                        key={d}
                        round
                        label={String(d)}
                        width={`${100 / 7}%`}
                        selected={picked === `${year}-${pad(month + 1)}-${pad(d)}`}
                        disabled={tooYoung(d)}
                        onPress={() => setPicked(`${year}-${pad(month + 1)}-${pad(d)}`)}
                      />
                    ),
                  )}
                </View>
              </View>
            )}

            <Text variant="small" style={{ textAlign: "center" }}>
              {picked ? formatDob(picked) : mode === "year" ? "Start with the year you were born" : "Tap the day"}
            </Text>
            <View style={{ flexDirection: "row", gap: space(2) }}>
              <Button title="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => setOpen(false)} />
              <Button
                title="Done"
                style={{ flex: 1 }}
                disabled={!picked}
                onPress={() => {
                  onChange(picked!);
                  setOpen(false);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Nav({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
      <RNText style={{ fontSize: 22, fontFamily: fonts.bold, color: colors.text, marginTop: -2 }}>{label}</RNText>
    </Pressable>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: space(3), paddingVertical: space(2), borderRadius: radius.pill, backgroundColor: active ? colors.ink : colors.goldSoft }}>
      <RNText style={{ fontFamily: fonts.extrabold, fontSize: 15, color: active ? colors.goldBright : colors.text }}>{label}</RNText>
      <RNText style={{ fontSize: 10, color: active ? colors.goldBright : colors.gold }}>▾</RNText>
    </Pressable>
  );
}

function Cell({ label, selected, disabled, onPress, width, round }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void; width: string; round?: boolean }) {
  return (
    <View style={{ width: width as `${number}%`, height: round ? 42 : 48, alignItems: "center", justifyContent: "center" }}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        style={{
          width: round ? 38 : "88%",
          height: round ? 38 : 40,
          borderRadius: round ? 19 : radius.md,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: selected ? colors.ink : round ? "transparent" : colors.bg,
          opacity: disabled ? 0.25 : 1,
        }}
      >
        <RNText style={{ fontFamily: selected ? fonts.extrabold : fonts.semibold, fontSize: 14.5, color: selected ? colors.goldBright : colors.text }}>{label}</RNText>
      </Pressable>
    </View>
  );
}
