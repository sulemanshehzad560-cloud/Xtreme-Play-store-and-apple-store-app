import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ServiceIcon } from "@/components/art/ServiceIcon";
import { Button, Card, Chip, InlineLoader, Row, Screen, Text } from "@/components/ui";
import { FreeMaterials } from "@/components/Promo";
import { aed } from "@/lib/format";
import { colors, fonts, radius, space } from "@/lib/theme";
import type { Interval, SubscriptionPlan } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** Monthly / yearly cleaning plans set by the office. */
export default function Plans() {
  const plans = useApi<SubscriptionPlan[]>("/subscription-plans");
  const [interval, setInterval] = useState<Interval>("monthly");
  const list = (plans.data ?? []).filter((p) => (interval === "monthly" ? p.priceMonthlyAed : p.priceYearlyAed) != null);

  return (
    <Screen edges={["left", "right"]}>
      <Card tone="ink">
        <Text variant="label" style={{ color: colors.goldBright }}>REGULAR CLEANING PLANS</Text>
        <Text style={{ color: colors.onInk, fontFamily: fonts.extrabold, fontSize: 22, lineHeight: 28 }}>A spotless home, on schedule</Text>
        <Text style={{ color: "#CFC8BA", fontSize: 14 }}>
          Regular cleaning by the same trusted team, for less than booking visit by visit. Pay once per month or year and plan all your visits on a calendar.
        </Text>
      </Card>
      <FreeMaterials compact />

      <Row style={{ gap: space(2) }}>
        <View style={{ flex: 1 }}>
          <Chip label="Monthly" selected={interval === "monthly"} onPress={() => setInterval("monthly")} />
        </View>
        <View style={{ flex: 1 }}>
          <Chip label="Yearly" sub="best value" selected={interval === "yearly"} onPress={() => setInterval("yearly")} />
        </View>
      </Row>

      {!plans.data ? <InlineLoader label="Loading plans…" /> : null}
      {plans.data && list.length === 0 ? (
        <Card>
          <Text style={{ fontFamily: fonts.bold }}>No {interval} plans right now</Text>
          <Text variant="small">Try the other option, or book a one-off service from the home screen.</Text>
        </Card>
      ) : null}

      {list.map((p) => {
        const price = interval === "monthly" ? p.priceMonthlyAed! : p.priceYearlyAed!;
        const visits = p.visitsPerMonth * (interval === "monthly" ? 1 : 12);
        const perVisit = Math.round(price / visits);
        return (
          <Card key={p.id} onPress={() => router.push(`/subscribe/${p.id}?interval=${interval}`)}>
            <Row style={{ gap: space(3), alignItems: "flex-start" }}>
              <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
                <ServiceIcon name={p.service.key} size={44} tile={false} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="heading">{p.name}</Text>
                <Text variant="small">
                  {p.service.name} · {p.visitsPerMonth} visit{p.visitsPerMonth > 1 ? "s" : ""} a month
                </Text>
                {p.description ? <Text style={{ fontSize: 14, color: colors.muted }}>{p.description}</Text> : null}
              </View>
            </Row>
            <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
              <View>
                <Text variant="price">{aed(price)}</Text>
                <Text variant="small">
                  per {interval === "monthly" ? "month" : "year"} · about {aed(perVisit)} a visit
                </Text>
              </View>
              <Button title="Choose" size="sm" onPress={() => router.push(`/subscribe/${p.id}?interval=${interval}`)} />
            </Row>
          </Card>
        );
      })}

      <Text variant="small" style={{ textAlign: "center" }}>
        Prices include VAT and all cleaning materials. Pay securely by card or Tamara.
      </Text>
    </Screen>
  );
}
