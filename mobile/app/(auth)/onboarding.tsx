import { useRef, useState } from "react";
import { Dimensions, Pressable, ScrollView, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { BookScene, PayScene, TrackScene } from "@/components/art/Scenes";
import { Button } from "@/components/ui";
import { markOnboarded } from "@/lib/onboarding";
import { colors, fonts, space } from "@/lib/theme";

const W = Dimensions.get("window").width;

const SLIDES = [
  { Art: BookScene, title: "Book in seconds", body: "Home cleaning, deep cleaning, sofas, carpets and more. Pick a time that suits you and you're done." },
  { Art: TrackScene, title: "Track your team live", body: "See who's coming and watch them arrive on the map, minute by minute." },
  { Art: PayScene, title: "Pay your way", body: "Card, Apple Pay, Google Pay or Tamara in 4 instalments. No hidden charges." },
];

export default function Onboarding() {
  const [index, setIndex] = useState(0);
  const pager = useRef<ScrollView>(null);

  const finish = async () => {
    await markOnboarded();
    router.replace("/(auth)");
  };
  const next = () => {
    if (index === SLIDES.length - 1) return void finish();
    pager.current?.scrollTo({ x: (index + 1) * W, animated: true });
    setIndex(index + 1);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space(5), paddingTop: space(2) }}>
        <RNText style={{ color: colors.gold, fontFamily: fonts.extrabold, fontSize: 17 }}>
          Xtreme<RNText style={{ color: colors.ink }}>-Cleaning Partner</RNText>
        </RNText>
        <Pressable onPress={finish} accessibilityRole="button" hitSlop={12}>
          <RNText style={{ color: colors.muted, fontFamily: fonts.semibold, fontSize: 15 }}>Skip</RNText>
        </Pressable>
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / W))}
        style={{ flex: 1 }}
      >
        {SLIDES.map(({ Art, title, body }) => (
          <View key={title} style={{ width: W, alignItems: "center", justifyContent: "center", paddingHorizontal: space(8), gap: space(5) }}>
            <Art size={Math.min(300, W - space(12))} />
            <RNText style={{ fontFamily: fonts.extrabold, fontSize: 28, color: colors.text, textAlign: "center", letterSpacing: -0.4 }}>{title}</RNText>
            <RNText style={{ fontFamily: fonts.medium, fontSize: 16, lineHeight: 24, color: colors.muted, textAlign: "center" }}>{body}</RNText>
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: space(6), paddingBottom: space(6), gap: space(5) }}>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
          {SLIDES.map((_, i) => (
            <View key={i} style={{ width: i === index ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: i === index ? colors.ink : colors.border }} />
          ))}
        </View>
        <Button title={index === SLIDES.length - 1 ? "Get started" : "Next"} onPress={next} />
      </View>
    </SafeAreaView>
  );
}
