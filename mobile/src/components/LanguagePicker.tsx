import { Image, Pressable, Text as RNText, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLanguage, type Lang } from "@/lib/i18n";
import { fonts, radius, space } from "@/lib/theme";

const OPTIONS: { lang: Lang; label: string; hint: string; font: string }[] = [
  { lang: "en", label: "English", hint: "Continue in English", font: "PlusJakartaSans_800ExtraBold" },
  { lang: "ar", label: "العربية", hint: "المتابعة بالعربية", font: "Tajawal_800ExtraBold" },
];

/** First launch: pick English or Arabic. Shown in both languages so everyone can read it. */
export function LanguagePicker() {
  const { setLang } = useLanguage();
  return (
    <View style={{ flex: 1, backgroundColor: "#16130E" }}>
      <SafeAreaView style={{ flex: 1, paddingHorizontal: space(6), justifyContent: "center", gap: space(8) }}>
        <View style={{ alignItems: "center", gap: space(4) }}>
          <Image source={require("../../assets/logo-mark.png")} style={{ width: 96, height: 74 }} resizeMode="contain" />
          <View style={{ alignItems: "center", gap: space(1) }}>
            <RNText style={{ color: "#fff", fontFamily: "PlusJakartaSans_800ExtraBold", fontSize: 24 }}>Choose your language</RNText>
            <RNText style={{ color: "#E2C170", fontFamily: "Tajawal_700Bold", fontSize: 22 }}>اختر لغتك</RNText>
          </View>
        </View>
        <View style={{ gap: space(3) }}>
          {OPTIONS.map((o) => (
            <Pressable
              key={o.lang}
              onPress={() => setLang(o.lang)}
              accessibilityRole="button"
              accessibilityLabel={o.hint}
              style={({ pressed }) => ({
                flexDirection: o.lang === "ar" ? "row-reverse" : "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: pressed ? "#2A251D" : "#1F1B15",
                borderWidth: 1.5,
                borderColor: "#3A3326",
                borderRadius: radius.lg,
                paddingHorizontal: space(5),
                paddingVertical: space(5),
              })}
            >
              <View style={{ alignItems: o.lang === "ar" ? "flex-end" : "flex-start", gap: 2 }}>
                <RNText style={{ color: "#fff", fontFamily: o.font, fontSize: 22 }}>{o.label}</RNText>
                <RNText style={{ color: "#A79E8D", fontFamily: o.lang === "ar" ? "Tajawal_500Medium" : fonts.medium, fontSize: 14 }}>{o.hint}</RNText>
              </View>
              <RNText style={{ color: "#E2C170", fontSize: 24 }}>{o.lang === "ar" ? "‹" : "›"}</RNText>
            </Pressable>
          ))}
        </View>
        <RNText style={{ color: "#8A8172", fontFamily: fonts.medium, fontSize: 13, textAlign: "center", lineHeight: 20 }}>
          You can change this any time in Account.{"\n"}
          <RNText style={{ fontFamily: "Tajawal_500Medium" }}>يمكنك تغييرها في أي وقت من الحساب.</RNText>
        </RNText>
      </SafeAreaView>
    </View>
  );
}
