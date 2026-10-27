import { ScrollView, View } from "react-native";
import { Chip, Row, Text } from "./ui";
import { space } from "../lib/theme";

const SLOTS: [string, number[]][] = [
  ["Morning", [8, 9, 10, 11]],
  ["Afternoon", [12, 13, 14, 15]],
  ["Evening", [16, 17, 18]],
];

export function nextDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return d;
  });
}

/** ISO time for `hour`:00 Abu Dhabi (UTC+4, no daylight saving). */
export const abuDhabiTime = (day: Date, hour: number) => new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour - 4)).toISOString();
export const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;

/** Day strip plus start-time chips (Abu Dhabi time). */
export function SlotPicker({ days, day, onDay, hour, onHour }: { days: Date[]; day: Date; onDay: (d: Date) => void; hour: number | null; onHour: (h: number) => void }) {
  return (
    <>
      <Text variant="heading">Pick a day</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space(4) }} contentContainerStyle={{ gap: space(2), paddingHorizontal: space(4) }}>
        {days.map((d) => (
          <View key={d.toDateString()} style={{ width: 62 }}>
            <Chip label={String(d.getDate())} sub={d.toLocaleDateString("en-GB", { weekday: "short" })} selected={d.toDateString() === day.toDateString()} onPress={() => onDay(d)} />
          </View>
        ))}
      </ScrollView>
      <Text variant="small">{day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</Text>
      {SLOTS.map(([label, hours]) => (
        <View key={label} style={{ gap: space(2) }}>
          <Text variant="label">{label}</Text>
          <Row style={{ flexWrap: "wrap", gap: space(2) }}>
            {hours.map((h) => (
              <View key={h} style={{ width: "31%" }}>
                <Chip label={hourLabel(h)} selected={hour === h} onPress={() => onHour(h)} />
              </View>
            ))}
          </Row>
        </View>
      ))}
      <Text variant="small">Your team arrives within 30 minutes of the start time.</Text>
    </>
  );
}
