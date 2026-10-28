import { Image, Text, View } from "react-native";
import { fonts } from "@/lib/theme";

/** Xtreme gold logo with the app name, for dark headers. */
export function BrandMark({ size = 30, light = true, sub }: { size?: number; light?: boolean; sub?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Image source={require("../../assets/logo-mark.png")} style={{ width: size * 1.3, height: size }} resizeMode="contain" accessibilityLabel="Xtreme" />
      <View>
        <Text style={{ fontFamily: fonts.extrabold, fontSize: size * 0.56, letterSpacing: -0.2, color: light ? "#fff" : "#16130E" }}>
          <Text style={{ color: light ? "#E2C170" : "#B98F35" }}>Xtreme</Text>-Cleaning Partner
        </Text>
        {sub ? <Text style={{ fontFamily: fonts.medium, fontSize: size * 0.36, color: light ? "#A79E8D" : "#6F685C" }}>{sub}</Text> : null}
      </View>
    </View>
  );
}
