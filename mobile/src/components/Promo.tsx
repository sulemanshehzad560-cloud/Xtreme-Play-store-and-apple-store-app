import { Pressable, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { aed } from "../lib/format";
import { colors, fonts, radius, shadow, space } from "../lib/theme";
import type { SubscriptionPlan } from "../lib/types";
import { useApi } from "../lib/useApi";
import { LineIcon } from "./LineIcon";

/** "Cleaning materials are free" — shown on every tab and through booking and checkout. */
export function FreeMaterials({ compact = false }: { compact?: boolean }) {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel="Cleaning materials are free of cost"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space(3),
        backgroundColor: colors.successSoft,
        borderWidth: 1,
        borderColor: colors.successLine,
        borderRadius: radius.lg,
        paddingHorizontal: space(3.5),
        paddingVertical: compact ? space(2.5) : space(3),
      }}
    >
      <View style={{ width: compact ? 34 : 42, height: compact ? 34 : 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <LineIcon name="bottle" size={compact ? 18 : 22} color={colors.success} />
      </View>
      <View style={{ flex: 1 }}>
        <RNText style={{ color: colors.success, fontFamily: fonts.extrabold, fontSize: compact ? 14 : 15.5 }}>Cleaning materials are FREE</RNText>
        {compact ? null : (
          <RNText style={{ color: colors.successText, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17 }}>
            All materials and equipment are included in every booking. They don't cost you anything extra.
          </RNText>
        )}
      </View>
    </View>
  );
}

/**
 * Advert for the regular-cleaning plans (monthly / yearly), so new customers find them.
 * Hidden when the office has no plan on sale.
 */
export function PlanPromo() {
  const plans = useApi<SubscriptionPlan[]>("/subscription-plans");
  const offers = (plans.data ?? [])
    .flatMap((p) => [
      ...(p.priceMonthlyAed != null ? [{ p, perVisit: p.priceMonthlyAed / p.visitsPerMonth, label: `${aed(p.priceMonthlyAed)} / month` }] : []),
      ...(p.priceYearlyAed != null ? [{ p, perVisit: p.priceYearlyAed / (p.visitsPerMonth * 12), label: `${aed(p.priceYearlyAed)} / year` }] : []),
    ])
    .sort((a, b) => a.perVisit - b.perVisit);
  const best = offers[0];
  if (!best) return null;
  const count = plans.data!.length;

  return (
    <Pressable
      onPress={() => router.push("/plans")}
      accessibilityRole="button"
      accessibilityLabel="See regular cleaning plans"
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.985 : 1 }] })}
    >
      <View style={{ backgroundColor: colors.ink, borderRadius: radius.xl, padding: space(5), overflow: "hidden", gap: space(3), ...shadow.raised }}>
        <View style={{ position: "absolute", right: -50, top: -50, width: 190, height: 190, borderRadius: 95, backgroundColor: "#2A231A" }} />
        <View style={{ position: "absolute", right: 18, top: 18, backgroundColor: colors.goldBright, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: 5 }}>
          <RNText style={{ color: colors.ink, fontFamily: fonts.extrabold, fontSize: 11.5, letterSpacing: 0.4 }}>SAVE MORE</RNText>
        </View>
        <RNText style={{ color: colors.goldBright, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2 }}>REGULAR CLEANING PLANS</RNText>
        <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 23, lineHeight: 29, width: "78%" }}>Your home cleaned every week, for less</RNText>
        <View style={{ gap: space(1.5) }}>
          {[
            `From ${aed(Math.round(best.perVisit))} a visit (${best.label})`,
            "Same trusted team every visit",
            "Plan the whole month on a calendar",
            "Cleaning materials included free",
          ].map((t) => (
            <View key={t} style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
              <RNText style={{ color: colors.goldBright, fontFamily: fonts.extrabold, fontSize: 14 }}>✓</RNText>
              <RNText style={{ color: "#E9E3D6", fontFamily: fonts.semibold, fontSize: 13.5 }}>{t}</RNText>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space(1) }}>
          <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 12 }}>
            {count} plan{count > 1 ? "s" : ""} · monthly or yearly
          </RNText>
          <View style={{ backgroundColor: colors.goldBright, borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(2.5) }}>
            <RNText style={{ color: colors.ink, fontFamily: fonts.extrabold, fontSize: 14 }}>See plans →</RNText>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
