import { useState } from "react";
import { Pressable, Share, Text as RNText, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Button, Card, InlineLoader, Row, Screen, Text } from "@/components/ui";
import { LineIcon, iconColor, iconSoft, type LineIconName } from "@/components/LineIcon";
import { colors, fonts, radius, space } from "@/lib/theme";
import { useApi } from "@/lib/useApi";

interface Referral {
  code: string;
  enabled: boolean;
  friendAed: number;
  rewardAed: number;
  invited: number;
  rewardsAvailable: { id: string; name: string; valueAed: number }[];
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
        <InlineLoader label="Getting your invite code…" />
      </Screen>
    );
  }

  const message =
    `I use Xtreme-Cleaning Partner for home cleaning in Abu Dhabi (cleaning materials are free!). ` +
    (r.friendAed > 0 ? `Use my code ${r.code} for AED ${r.friendAed} off your first clean.` : `Use my code ${r.code} when you book.`) +
    `\nAndroid: ${PLAY}\niPhone: ${APPLE}`;

  async function copy() {
    await Clipboard.setStringAsync(r!.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const steps: [LineIconName, string, string][] = [
    ["share", "Share your code", "Send it to friends and family on WhatsApp or anywhere."],
    ["calendar", "They book their first clean", r.friendAed > 0 ? `They get AED ${r.friendAed} off when they enter your code.` : "They enter your code at checkout."],
    ["tag", "You get a credit", r.rewardAed > 0 ? `AED ${r.rewardAed} comes off your next booking automatically.` : "We'll thank you with a special offer."],
  ];

  return (
    <Screen edges={["left", "right"]}>
      <Card tone="ink" style={{ gap: space(3), paddingVertical: space(6) }}>
        <RNText style={{ color: colors.goldBright, fontFamily: fonts.extrabold, fontSize: 12, letterSpacing: 1.2 }}>REFER A FRIEND</RNText>
        <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 32 }}>
          {r.friendAed > 0 && r.rewardAed > 0 ? `Give AED ${r.friendAed},\nget AED ${r.rewardAed}` : "Share the clean"}
        </RNText>
        <RNText style={{ color: "#D9D2C4", fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 }}>
          Friends save on their first clean. You get a credit for every friend who books.
        </RNText>
        <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel={`Copy your code ${r.code}`} style={{ marginTop: space(2), flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.goldBright, borderRadius: radius.lg, paddingHorizontal: space(4), paddingVertical: space(3.5) }}>
          <View>
            <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 12 }}>Your code</RNText>
            <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 24, letterSpacing: 2 }}>{r.code}</RNText>
          </View>
          <RNText style={{ color: colors.goldBright, fontFamily: fonts.bold, fontSize: 14 }}>{copied ? "Copied ✓" : "Copy"}</RNText>
        </Pressable>
        <Button title="Share with friends" variant="gold" icon={<LineIcon name="share" size={18} color="#16130E" />} onPress={() => Share.share({ message })} />
      </Card>

      <Row style={{ gap: space(3) }}>
        <Stat value={String(r.invited)} label="Friends joined" />
        <Stat value={`AED ${r.rewardsAvailable.reduce((n, x) => n + x.valueAed, 0)}`} label="Credit ready to use" />
      </Row>

      {r.rewardsAvailable.length ? (
        <Card tone="gold">
          <Text variant="label">YOUR CREDITS</Text>
          {r.rewardsAvailable.map((x) => (
            <Row key={x.id} style={{ justifyContent: "space-between" }}>
              <Text style={{ flex: 1 }}>{x.name}</Text>
              <Text style={{ fontFamily: fonts.extrabold, color: colors.gold }}>AED {x.valueAed}</Text>
            </Row>
          ))}
          <Text variant="small">Credits come off your next booking automatically. No code needed.</Text>
        </Card>
      ) : null}

      <Text variant="heading">How it works</Text>
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
        Codes work on a friend's first paid booking. Credits can't be exchanged for cash.
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
