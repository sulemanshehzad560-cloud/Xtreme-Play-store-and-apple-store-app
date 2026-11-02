import { useState } from "react";
import { Pressable, Share, Text as RNText, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Button, Card, InlineLoader, Row, Screen, Text } from "@/components/ui";
import { LineIcon, iconColor, iconSoft, type LineIconName } from "@/components/LineIcon";
import { colors, fonts, radius, space } from "@/lib/theme";
import { useApi } from "@/lib/useApi";
import { t } from "@/lib/i18n";

interface Referral {
  code: string;
  enabled: boolean;
  friendAed: number;
  rewardAed: number;
  invited: number;
  walletAed: number;
}

const PLAY = "https://play.google.com/store/apps/details?id=ae.xtremefm.app";
const APPLE = "https://apps.apple.com/app/id6826784890";

/** Refer a friend: the friend saves on their first clean, the inviter gets a credit. */
export default function Invite() {
  const ref = useApi<Referral>("/me/referral");
  const [copied, setCopied] = useState(false);
  const r = ref.data;
  if (!r) {
    return (
      <Screen edges={["left", "right"]}>
        <InlineLoader label={t("Getting your invite code…")} />
      </Screen>
    );
  }

  const message =
    t("I use Xtreme-Cleaning Partner for home cleaning in Abu Dhabi (cleaning materials are free!). ") +
    (r.friendAed > 0 ? t("Use my code {0} for AED {1} off your first clean.", { 0: r.code, 1: r.friendAed }) : t("Use my code {0} when you book.", { 0: r.code })) +
    t("\nAndroid: {0}\niPhone: {1}", { 0: PLAY, 1: APPLE });

  async function copy() {
    await Clipboard.setStringAsync(r!.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const steps: [LineIconName, string, string][] = [
    ["share", t("Share your code"), t("Send it to friends and family on WhatsApp or anywhere.")],
    ["calendar", t("They book their first clean"), r.friendAed > 0 ? t("They get AED {0} off when they enter your code.", { 0: r.friendAed }) : t("They enter your code at checkout.")],
    ["tag", t("AED in your wallet"), r.rewardAed > 0 ? t("Once their first clean is done, AED {0} is added to your wallet and comes off your next booking.", { 0: r.rewardAed }) : t("We'll thank you with a special offer.")],
  ];

  return (
    <Screen edges={["left", "right"]}>
      <Card tone="ink" style={{ gap: space(3), paddingVertical: space(6) }}>
        <RNText style={{ color: colors.goldBright, fontFamily: fonts.extrabold, fontSize: 12, letterSpacing: 1.2 }}>{t("REFER A FRIEND")}</RNText>
        <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 32 }}>
          {r.friendAed > 0 && r.rewardAed > 0 ? t("Give AED {0},\nget AED {1}", { 0: r.friendAed, 1: r.rewardAed }) : t("Share the clean")}
        </RNText>
        <RNText style={{ color: "#D9D2C4", fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 }}>
          {t("Friends save on their first clean. You get wallet credit for every friend whose first clean is done.")}
        </RNText>
        <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel={t("Copy your code {0}", { 0: r.code })} style={{ marginTop: space(2), flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.goldBright, borderRadius: radius.lg, paddingHorizontal: space(4), paddingVertical: space(3.5) }}>
          <View>
            <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 12 }}>{t("Your code")}</RNText>
            <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 24, letterSpacing: 2 }}>{r.code}</RNText>
          </View>
          <RNText style={{ color: colors.goldBright, fontFamily: fonts.bold, fontSize: 14 }}>{copied ? t("Copied ✓") : t("Copy")}</RNText>
        </Pressable>
        <Button title={t("Share with friends")} variant="gold" icon={<LineIcon name="share" size={18} color="#16130E" />} onPress={() => Share.share({ message })} />
      </Card>

      <Row style={{ gap: space(3) }}>
        <Stat value={String(r.invited)} label={t("Friends joined")} />
        <Stat value={t("AED {0}", { 0: r.walletAed })} label={t("Wallet balance")} />
      </Row>
      {r.walletAed > 0 ? (
        <Card tone="gold">
          <Text style={{ fontFamily: fonts.bold }}>{t("AED")}{" "}{r.walletAed}{" "}{t("wallet credit ready")}</Text>
          <Text variant="small">{t("It comes off your next booking automatically. Whatever isn't used stays in your wallet.")}</Text>
        </Card>
      ) : null}

      <Text variant="heading">{t("How it works")}</Text>
      {steps.map(([icon, title, body], i) => (
        <Row key={title} style={{ alignItems: "flex-start", gap: space(3) }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: iconSoft(icon), alignItems: "center", justifyContent: "center" }}>
            <LineIcon name={icon} size={22} color={iconColor(icon)} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.bold }}>
              {i + 1}. {title}
            </Text>
            <Text variant="small">{body}</Text>
          </View>
        </Row>
      ))}
      <Text variant="small" style={{ textAlign: "center", marginTop: space(2) }}>
        {t("Codes work on a friend's first booking. Wallet credit is added after that clean is completed and can't be exchanged for cash.")}
      </Text>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4), gap: 2 }}>
      <RNText style={{ color: colors.text, fontFamily: fonts.extrabold, fontSize: 22 }}>{value}</RNText>
      <Text variant="small">{label}</Text>
    </View>
  );
}
