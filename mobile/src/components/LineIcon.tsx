import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors } from "../lib/theme";

// Simple, consistent line icons for settings and info rows (1.8px strokes on a 24px grid).
export type LineIconName =
  | "phone"
  | "pin"
  | "bell"
  | "key"
  | "chat"
  | "call"
  | "mail"
  | "globe"
  | "logout"
  | "trash"
  | "shield"
  | "doc"
  | "receipt"
  | "star"
  | "calendar"
  | "edit"
  | "share"
  | "bolt"
  | "lock"
  | "sparkle"
  | "home"
  | "villa"
  | "office"
  | "restaurant"
  | "card"
  | "clock"
  | "tag"
  | "sun"
  | "moon"
  | "auto"
  | "check"
  | "alert"
  | "bottle"
  | "user"
  | "map"
  | "briefcase"
  | "search";

// Each icon has its own colour, so lists and highlights are easy to scan.
const TINT: Partial<Record<LineIconName, string>> = {
  phone: "#2F6FDE",
  pin: "#E5484D",
  bell: "#F5A524",
  key: "#B98F35",
  chat: "#1E9E5A",
  call: "#1E9E5A",
  mail: "#2F6FDE",
  globe: "#0090FF",
  shield: "#2F6FDE",
  trash: "#E5484D",
  doc: "#8E4EC6",
  receipt: "#12A594",
  star: "#F5A524",
  calendar: "#8E4EC6",
  edit: "#B98F35",
  share: "#2F6FDE",
  bolt: "#F76B15",
  lock: "#12A594",
  sparkle: "#B98F35",
  home: "#F76B15",
  villa: "#F76B15",
  office: "#2F6FDE",
  briefcase: "#8E4EC6",
  restaurant: "#E5484D",
  card: "#2F6FDE",
  clock: "#F76B15",
  tag: "#1E9E5A",
  sun: "#F5A524",
  moon: "#6E56CF",
  auto: "#12A594",
  check: "#1E9E5A",
  alert: "#F76B15",
  bottle: "#12A594",
  user: "#2F6FDE",
  map: "#1E9E5A",
};

/** The icon's own colour (for coloured icons on light or dark backgrounds). */
export const iconColor = (name: LineIconName) => TINT[name] ?? colors.gold;
/** A soft background in the icon's colour. */
export const iconSoft = (name: LineIconName) => `${iconColor(name)}22`;

export function LineIcon({ name, size = 22, color = colors.text }: { name: LineIconName; size?: number; color?: string }) {
  const p = { stroke: color, strokeWidth: 1.8, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {(() => {
        switch (name) {
          case "phone":
            return (
              <>
                <Rect x={6.5} y={2.5} width={11} height={19} rx={2.5} {...p} />
                <Path d="M10.5 18.5h3" {...p} />
              </>
            );
          case "pin":
            return (
              <>
                <Path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z" {...p} />
                <Circle cx={12} cy={10} r={2.4} {...p} />
              </>
            );
          case "bell":
            return <Path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5ZM10 20.5a2 2 0 0 0 4 0" {...p} />;
          case "key":
            return (
              <>
                <Circle cx={8} cy={15} r={4} {...p} />
                <Path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2" {...p} />
              </>
            );
          case "chat":
            return <Path d="M4 18.5V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6.5a3 3 0 0 1-3 3H8.5L4 20v-1.5ZM8.5 9.5h7M8.5 12.5h4.5" {...p} />;
          case "call":
            return <Path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5C10.6 20 4 13.4 3.5 5.6A1.5 1.5 0 0 1 5 4Z" {...p} />;
          case "mail":
            return (
              <>
                <Rect x={3} y={5} width={18} height={14} rx={2.5} {...p} />
                <Path d="M4 7l8 6 8-6" {...p} />
              </>
            );
          case "globe":
            return (
              <>
                <Circle cx={12} cy={12} r={8.5} {...p} />
                <Path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17" {...p} />
              </>
            );
          case "logout":
            return <Path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h9" {...p} />;
          case "trash":
            return <Path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-12.5M10 11v6M14 11v6" {...p} />;
          case "shield":
            return <Path d="M12 3l7 3v5.5c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5V6l7-3ZM9 12l2 2 4-4" {...p} />;
          case "doc":
            return <Path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v4h4M9 12h6M9 15.5h6" {...p} />;
          case "receipt":
            return <Path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21V3ZM9 8h6M9 11.5h6M9 15h3.5" {...p} />;
          case "star":
            return <Path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" {...p} />;
          case "calendar":
            return (
              <>
                <Rect x={3.5} y={5} width={17} height={15.5} rx={2.5} {...p} />
                <Path d="M3.5 10h17M8 3v4M16 3v4" {...p} />
              </>
            );
          case "edit":
            return <Path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" {...p} />;
          case "share":
            return <Path d="M12 15V4M8 7.5L12 3.5l4 4M5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7" {...p} />;
          case "bolt":
            return <Path d="M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8Z" {...p} />;
          case "lock":
            return (
              <>
                <Rect x={4.5} y={10.5} width={15} height={10.5} rx={2.5} {...p} />
                <Path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2.5" {...p} />
              </>
            );
          case "sparkle":
            return <Path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7ZM19 16.5c.2 1.4.9 2.1 2.3 2.3-1.4.2-2.1.9-2.3 2.3-.2-1.4-.9-2.1-2.3-2.3 1.4-.2 2.1-.9 2.3-2.3Z" {...p} />;
          case "home":
            return <Path d="M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5.5h4V20" {...p} />;
          case "villa":
            return <Path d="M2.5 12 9 6.5l6.5 5.5M4.5 10.5V20h9v-9.5M13.5 13H21v7h-7.5M17 13V9.5h2V13M7.5 20v-4h3v4" {...p} />;
          case "office":
            return <Path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h7A1.5 1.5 0 0 1 15 4.5V21M15 9h3.5A1.5 1.5 0 0 1 20 10.5V21M3 21h18M8.5 7h3M8.5 11h3M8.5 15h3" {...p} />;
          case "restaurant":
            return <Path d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.2 1.2-3.5 3.6-3.5 7v4H17" {...p} />;
          case "card":
            return (
              <>
                <Rect x={2.5} y={5} width={19} height={14} rx={2.5} {...p} />
                <Path d="M2.5 9.5h19M6.5 15h4" {...p} />
              </>
            );
          case "clock":
            return (
              <>
                <Circle cx={12} cy={12} r={8.5} {...p} />
                <Path d="M12 7.5V12l3 2" {...p} />
              </>
            );
          case "tag":
            return (
              <>
                <Path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9-8-8Z" {...p} />
                <Circle cx={8} cy={8} r={1.4} {...p} />
              </>
            );
          case "sun":
            return (
              <>
                <Circle cx={12} cy={12} r={4} {...p} />
                <Path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" {...p} />
              </>
            );
          case "moon":
            return <Path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" {...p} />;
          case "auto":
            return (
              <>
                <Circle cx={12} cy={12} r={8.5} {...p} />
                <Path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill={color} stroke="none" />
              </>
            );
          case "check":
            return (
              <>
                <Circle cx={12} cy={12} r={8.5} {...p} />
                <Path d="m8.2 12.3 2.6 2.6 5-5.4" {...p} />
              </>
            );
          case "alert":
            return <Path d="M12 3.5 21.5 20h-19L12 3.5ZM12 10v4.5M12 17.2v.3" {...p} />;
          case "bottle":
            return <Path d="M10 2.5h4M10.5 2.5v3.5L8 9v11a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 16 20V9l-2.5-3V2.5M8 13h8" {...p} />;
          case "user":
            return (
              <>
                <Circle cx={12} cy={8} r={4} {...p} />
                <Path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" {...p} />
              </>
            );
          case "briefcase":
            return (
              <>
                <Rect x={3} y={7} width={18} height={13} rx={2.5} {...p} />
                <Path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18" {...p} />
              </>
            );
          case "search":
            return (
              <>
                <Circle cx={10.5} cy={10.5} r={6.5} {...p} />
                <Path d="m15.5 15.5 5 5" {...p} />
              </>
            );
          case "map":
            return <Path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4ZM9 4v14M15 6v14" {...p} />;
        }
      })()}
    </Svg>
  );
}
