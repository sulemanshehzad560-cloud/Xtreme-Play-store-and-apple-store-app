import { ScrollView, View } from "react-native";
import { Chip, Row, Text } from "./ui";
import { colors, fonts, space } from "../lib/theme";

const SLOTS: [string, number[]][] = [
  ["Morning", [8, 9, 10, 11]],
  ["Afternoon", [12, 13, 14, 15]],
  ["Evening", [16, 17, 18]],
];

/** Same-day bookings need this much notice (matches the server). */
export const LEAD_MINUTES = 60;

/** Today and the next n-1 days. */
export function nextDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** ISO time for `hour`:00 Abu Dhabi (UTC+4, no daylight saving). */
export const abuDhabiTime = (day: Date, hour: number) => new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour - 4)).toISOString();
export const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;

/** Start times still bookable on a day (today drops the ones too soon). */
export function openHours(day: Date) {
  const earliest = Date.now() + LEAD_MINUTES * 60_000;
  return SLOTS.flatMap(([, hours]) => hours).filter((h) => new Date(abuDhabiTime(day, h)).getTime() >= earliest);
}

/** First day (from today) that still has a free start time. */
export function firstOpenDay(days: Date[]) {
  return days.find((d) => openHours(d).length > 0) ?? days[0]!;
}

const dayName = (d: Date, i: number) => (i === 0 ? "Today" : i === 1 ? "Tmrw" : d.toLocaleDateString("en-GB", { weekday: "short" }));

/** Day strip plus start-time chips (Abu Dhabi time). */
export function SlotPicker({
  days,
  day,
  onDay,
  hour,
  onHour,
  title = "Pick a day",
  note,
}: {
  days: Date[];
  day: Date;
  onDay: (d: Date) => void;
  hour: number | null;
  onHour: (h: number | null) => void;
  title?: string;
  note?: string;
}) {
  const open = new Set(openHours(day));
  return (
    <>
      <Text variant="heading">{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space(4) }} contentContainerStyle={{ gap: space(2), paddingHorizontal: space(4) }}>
        {days.map((d, i) => {
          const full = openHours(d).length === 0;
          return (
            <View key={d.toDateString()} style={{ width: 70, opacity: full ? 0.4 : 1 }}>
              <Chip
                label={String(d.getDate())}
                sub={full ? "Full" : dayName(d, i)}
                selected={d.toDateString() === day.toDateString()}
                onPress={() => {
                  if (full) return;
                  onDay(d);
                  if (hour != null && !openHours(d).includes(hour)) onHour(null);
                }}
              />
            </View>
          );
        })}
      </ScrollView>
      <Text variant="small">
        {day.toDateString() === new Date().toDateString() ? "Today · " : ""}
        {day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
      </Text>
      {SLOTS.map(([label, hours]) => {
        const free = hours.filter((h) => open.has(h));
        if (!free.length) return null;
        return (
          <View key={label} style={{ gap: space(2) }}>
            <Text variant="label">{label}</Text>
            <Row style={{ flexWrap: "wrap", gap: space(2) }}>
              {free.map((h) => (
                <View key={h} style={{ width: "31%" }}>
                  <Chip label={hourLabel(h)} selected={hour === h} onPress={() => onHour(h)} />
                </View>
              ))}
            </Row>
          </View>
        );
      })}
      {note ? <Text style={{ fontSize: 13, color: colors.muted, fontFamily: fonts.medium, lineHeight: 19 }}>{note}</Text> : null}
    </>
  );
}
