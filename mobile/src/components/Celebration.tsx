import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Modal, Platform, Text as RNText, useWindowDimensions, View } from "react-native";
import * as Haptics from "expo-haptics";
import { SuccessBurst } from "./art/Motion";
import { Button } from "./ui";
import { colors, fonts, radius, space } from "@/lib/theme";
import { isRTL, t } from "@/lib/i18n";

const CONFETTI = ["#E2C170", "#B98F35", "#1E9E5A", "#3B82F6", "#EC4899", "#F59E0B", "#FFFFFF"];

/** Full-screen "order confirmed" celebration with falling confetti, shown once after a successful payment. */
export function Celebration({ visible, title, message, onClose }: { visible: boolean; title: string; message: string; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const pop = useRef(new Animated.Value(0)).current;
  const fall = useRef(new Animated.Value(0)).current;

  const pieces = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * 120,
        delay: Math.random() * 0.35,
        spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
        w: 6 + Math.random() * 6,
        h: 10 + Math.random() * 8,
        round: i % 4 === 0,
        color: CONFETTI[i % CONFETTI.length],
      })),
    [width],
  );

  useEffect(() => {
    if (!visible) return;
    pop.setValue(0);
    fall.setValue(0);
    if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(fall, { toValue: 1, duration: 3200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, direction: isRTL() ? "rtl" : "ltr", backgroundColor: "rgba(10,8,5,0.72)", alignItems: "center", justifyContent: "center", padding: space(6) }}>
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
          {pieces.map((p, i) => {
            const t = fall.interpolate({ inputRange: [p.delay, 1], outputRange: [0, 1], extrapolate: "clamp" });
            return (
              <Animated.View
                key={i}
                style={{
                  position: "absolute",
                  left: p.x,
                  top: -30,
                  width: p.w,
                  height: p.round ? p.w : p.h,
                  borderRadius: p.round ? p.w / 2 : 2,
                  backgroundColor: p.color,
                  opacity: t.interpolate({ inputRange: [0, 0.05, 0.85, 1], outputRange: [0, 1, 1, 0] }),
                  transform: [
                    { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, height + 60] }) },
                    { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
                    { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.spin}deg`] }) },
                  ],
                }}
              />
            );
          })}
        </View>

        <Animated.View
          style={{
            width: "100%",
            maxWidth: 380,
            backgroundColor: colors.surface,
            borderRadius: radius.xl,
            paddingHorizontal: space(6),
            paddingTop: space(4),
            paddingBottom: space(6),
            alignItems: "center",
            gap: space(2),
            opacity: pop,
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
          }}
        >
          <SuccessBurst size={130} />
          <RNText style={{ color: colors.gold, fontFamily: fonts.extrabold, fontSize: 12, letterSpacing: 1.4 }}>{t("PAID & CONFIRMED")}</RNText>
          <RNText style={{ color: colors.text, fontFamily: fonts.extrabold, fontSize: 24, textAlign: "center" }}>{title}</RNText>
          <RNText style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, textAlign: "center" }}>{message}</RNText>
          <Button title={t("Awesome!")} variant="gold" onPress={onClose} style={{ alignSelf: "stretch", marginTop: space(3) }} />
        </Animated.View>
      </View>
    </Modal>
  );
}
