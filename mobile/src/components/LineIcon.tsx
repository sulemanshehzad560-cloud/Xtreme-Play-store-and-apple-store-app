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
  | "share";

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
        }
      })()}
    </Svg>
  );
}
