import { Linking, View } from "react-native";
import { API_URL } from "@/lib/config";
import { Button, Card, Screen, Text } from "@/components/ui";
import { LineIcon, iconColor, type LineIconName } from "@/components/LineIcon";
import { goSignIn } from "@/lib/guest";
import { space } from "@/lib/theme";
import { t } from "@/lib/i18n";

/** Shown on account-based tabs to guests who are browsing without an account. */
export function GuestPrompt({ title, icon, body }: { title: string; icon: LineIconName; body: string }) {
  return (
    <Screen>
      <Text variant="title">{title}</Text>
      <Card style={{ alignItems: "center", gap: space(3), paddingVertical: space(8) }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" }}>
          <LineIcon name={icon} size={32} color={iconColor(icon)} />
        </View>
        <Text variant="heading" style={{ textAlign: "center" }}>{t("Sign in to continue")}</Text>
        <Text variant="muted" style={{ textAlign: "center" }}>{body}</Text>
        <Button title={t("Sign in or create account")} onPress={goSignIn} style={{ alignSelf: "stretch", marginTop: space(2) }} />
      </Card>
      <Text variant="small" style={{ textAlign: "center" }}>{t("You can browse all services and prices without an account.")}</Text>
      <Button title={t("Privacy policy")} variant="ghost" onPress={() => void Linking.openURL(`${API_URL}/privacy`)} />
    </Screen>
  );
}
