import { useMemo, useState } from "react";
import { Pressable, Text as RNText, View } from "react-native";
import { Chip, Row, Text } from "./ui";
import { hourLabel, openHours } from "./SlotPicker";
import { colors, fonts, radius, space } from "../lib/theme";

/** "YYYY-MM-DD" for a local date. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fromKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12);
};
/** Local day key of an ISO timestamp, in Abu Dhabi time. */
export const isoDayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

/**
 * A month grid to plan several visits at once: tap days to add or remove them (up to `max`),
 * then choose one start time for all of them. Days already booked are marked.
 */
export function MonthCalendar({
  selected,
  onChange,
  max,
  until,
  hour,
  onHour,
  booked = {},
  firstLabel,
}: {
  selected: string[];
  onChange: (keys: string[]) => void;
  max: number;
  /** Last bookable day. */
  until: Date;
  hour: number | null;
  onHour: (h: number | null) => void;
  /** Days that already have a visit, with a short label (e.g. a status). */
  booked?: Record<string, string>;
  /** Badge for the first selected day (e.g. "Paid"). */
  firstLabel?: string;
}) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  }, []);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1, 12));
  const lastMonth = new Date(until.getFullYear(), until.getMonth(), 1, 12);
  const canPrev = month > new Date(today.getFullYear(), today.getMonth(), 1, 12);
  const canNext = month < lastMonth;

  const cells = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: daysIn }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1, 12))];
  }, [month]);

  const sorted = [...selected].sort();
  const full = selected.length >= max;
  // A start time works if every picked day still has it free (only matters for today).
  const hourOk = (h: number) => sorted.every((k) => openHours(fromKey(k)).includes(h));

  function toggle(k: string) {
    if (selected.includes(k)) onChange(selected.filter((x) => x !== k));
    else if (!full) {
      const next = [...selected, k];
      onChange(next);
      if (hour != null && !next.every((x) => openHours(fromKey(x)).includes(hour))) onHour(null);
    }
  }

  return (
    <View style={{ gap: space(3) }}>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(3), gap: space(2) }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Nav label="‹" disabled={!canPrev} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))} />
          <Text style={{ fontFamily: fonts.extrabold, fontSize: 16 }}>{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</Text>
          <Nav label="›" disabled={!canNext} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))} />
        </Row>
        <View style={{ flexDirection: "row" }}>
          {WEEK.map((w) => (
            <RNText key={w} style={{ flex: 1, textAlign: "center", fontFamily: fonts.semibold, fontSize: 11.5, color: colors.faint }}>
              {w}
            </RNText>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {cells.map((d, i) => {
            if (!d) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 46 }} />;
            const k = dayKey(d);
            const open = d >= today && d <= until && openHours(d).length > 0;
            const order = sorted.indexOf(k);
            const on = order >= 0;
            const mark = booked[k];
            const isToday = k === dayKey(today);
            return (
              <View key={k} style={{ width: `${100 / 7}%`, height: 46, alignItems: "center", justifyContent: "center" }}>
                <Pressable
                  onPress={open && !mark ? () => toggle(k) : undefined}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: !open || Boolean(mark) }}
                  accessibilityLabel={d.toDateString()}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: on ? colors.ink : mark ? colors.successSoft : "transparent",
                    borderWidth: isToday && !on ? 1.5 : 0,
                    borderColor: colors.goldBright,
                    opacity: open || mark ? 1 : 0.28,
                  }}
                >
                  <RNText style={{ fontFamily: on || mark ? fonts.extrabold : fonts.semibold, fontSize: 14.5, color: on ? colors.goldBright : mark ? colors.success : colors.text }}>{d.getDate()}</RNText>
                  {on && order === 0 && firstLabel ? (
                    <View style={{ position: "absolute", bottom: -6, backgroundColor: colors.goldBright, borderRadius: 6, paddingHorizontal: 4 }}>
                      <RNText style={{ fontSize: 8.5, fontFamily: fonts.extrabold, color: colors.ink }}>{firstLabel}</RNText>
                    </View>
                  ) : null}
                  {mark ? <View style={{ position: "absolute", bottom: 4, width: 5, height: 5, borderRadius: 3, backgroundColor: colors.success }} /> : null}
                </Pressable>
              </View>
            );
          })}
        </View>
        <Row style={{ justifyContent: "space-between", marginTop: space(1) }}>
          <Text variant="small">
            <Text style={{ fontFamily: fonts.extrabold, color: colors.text }}>{selected.length}</Text> of {max} visit{max === 1 ? "" : "s"} picked
          </Text>
          {selected.length ? (
            <Text onPress={() => onChange([])} style={{ color: colors.danger, fontFamily: fonts.bold, fontSize: 13 }}>
              Clear
            </Text>
          ) : null}
        </Row>
        {Object.keys(booked).length ? (
          <Row style={{ gap: space(2) }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success }} />
            <Text variant="small">Already booked</Text>
          </Row>
        ) : null}
      </View>

      <Text variant="heading">Start time for {selected.length > 1 ? "all visits" : "your visit"}</Text>
      <Row style={{ flexWrap: "wrap", gap: space(2) }}>
        {HOURS.map((h) => {
          const ok = hourOk(h);
          return (
            <View key={h} style={{ width: "31%", opacity: ok ? 1 : 0.35 }}>
              <Chip label={hourLabel(h)} selected={hour === h} onPress={() => ok && onHour(h)} />
            </View>
          );
        })}
      </Row>
    </View>
  );
}

function Nav({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, opacity: disabled ? 0.3 : 1 }}>
      <RNText style={{ fontSize: 22, fontFamily: fonts.bold, color: colors.text, marginTop: -2 }}>{label}</RNText>
    </Pressable>
  );
}
