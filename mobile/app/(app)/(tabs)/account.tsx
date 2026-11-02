import { useState, type ReactNode } from "react";
import { Alert, Image, Linking, Platform, Pressable, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import { AccessToken, LoginManager } from "react-native-fbsdk-next";
import { Button, Card, ErrorText, Input, Row, Screen, Text } from "@/components/ui";
import { BirthdayPicker, formatDob } from "@/components/BirthdayPicker";
import { ProfilePhoto } from "@/components/ProfilePhoto";
import { BrandMark } from "@/components/BrandMark";
import { FreeMaterials, PlanPromo } from "@/components/Promo";
import { LineIcon, iconColor, iconSoft, type LineIconName } from "@/components/LineIcon";
import { API_URL } from "@/lib/config";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DEMO } from "@/lib/demo";
import { colors, fonts, radius, shadow, space } from "@/lib/theme";
import type { Booking, Company } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useThemeMode, type ThemeMode } from "@/lib/themeMode";
import { t, useLanguage, type Lang } from "@/lib/i18n";

const METHOD_LABEL: Record<string, string> = { phone: "Mobile", google: "Google", facebook: "Facebook", apple: "Apple" };

export default function Account() {
  const { user, refreshUser, signOut } = useAuth();
  const company = useApi<Company>("/company");
  const addresses = useApi<{ id: string; label: string; area: string }[]>("/me/addresses");
  const history = useApi<Booking[]>("/bookings?limit=50");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [dob, setDob] = useState<string | null>(user?.dateOfBirth ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!user) return null;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api("/me", { method: "PATCH", body: { fullName: name.trim() || undefined, email: email.trim() || null, ...(dob ? { dateOfBirth: dob } : {}) } });
      await refreshUser();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not save"));
    } finally {
      setSaving(false);
    }
  }

  async function link(provider: "google" | "facebook" | "apple") {
    try {
      let token: string | null = DEMO ? "demo-token-demo-token-demo" : null;
      let nonce: string | undefined;
      if (!DEMO && provider === "google") {
        const r = await GoogleSignin.signIn();
        token = isSuccessResponse(r) ? r.data.idToken : null;
      } else if (!DEMO && provider === "facebook") {
        const r = await LoginManager.logInWithPermissions(["public_profile", "email"]);
        token = r.isCancelled ? null : ((await AccessToken.getCurrentAccessToken())?.accessToken ?? null);
      } else if (!DEMO) {
        nonce = Crypto.randomUUID();
        const cred = await AppleAuthentication.signInAsync({
          requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
          nonce: await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce),
        });
        token = cred.identityToken;
      }
      if (!token) return;
      await api(`/me/identities/${provider}`, { body: { token, nonce } });
      await refreshUser();
    } catch (e) {
      if (e instanceof Error && !/cancel/i.test(e.message)) Alert.alert(t("Could not connect"), e.message);
    }
  }

  function confirmDelete() {
    Alert.alert(t("Delete your account?"), t("Your profile, addresses and sign-in methods are erased and open bookings are cancelled (paid ones refunded). This can't be undone."), [
      { text: t("Keep my account"), style: "cancel" },
      {
        text: t("Delete"),
        style: "destructive",
        onPress: async () => {
          await api("/me", { method: "DELETE" });
          await signOut();
        },
      },
    ]);
  }

  const providers: ("google" | "facebook" | "apple")[] = Platform.OS === "ios" ? ["google", "facebook", "apple"] : ["google", "facebook"];
  const missing = providers.filter((p) => !user.signInMethods.includes(p));
  const total = history.data?.length ?? 0;
  const completed = history.data?.filter((b) => b.status === "completed").length ?? 0;
  const open = (url: string) => Linking.openURL(url);

  return (
    <Screen>
      {/* Branded profile card */}
      <View style={{ backgroundColor: colors.ink, borderRadius: radius.xl, padding: space(5), gap: space(4), overflow: "hidden", ...shadow.raised }}>
        <Image source={require("../../../assets/logo-mark.png")} style={{ position: "absolute", right: -40, top: -10, width: 230, height: 175, opacity: 0.1 }} resizeMode="contain" />
        <Row style={{ justifyContent: "space-between" }}>
          <BrandMark size={24} />
          <Pressable onPress={() => setEditing(!editing)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#2A251D", borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) }}>
            <LineIcon name="edit" size={15} color={colors.goldBright} />
            <RNText style={{ color: colors.goldBright, fontFamily: fonts.bold, fontSize: 13 }}>{editing ? t("Close") : t("Edit")}</RNText>
          </Pressable>
        </Row>
        <Row>
          <View style={{ padding: 3, borderRadius: 40, borderWidth: 2, borderColor: colors.goldBright }}>
            <ProfilePhoto size={64} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <RNText style={{ color: "#fff", fontFamily: fonts.extrabold, fontSize: 21 }} numberOfLines={1}>
              {user.fullName ?? t("Add your name")}
            </RNText>
            <RNText style={{ color: "#BDB4A3", fontFamily: fonts.medium, fontSize: 13 }}>{user.phone ?? t("No mobile number yet")}</RNText>
            {user.email ? <RNText style={{ color: "#BDB4A3", fontFamily: fonts.medium, fontSize: 13 }} numberOfLines={1}>{user.email}</RNText> : null}
            {user.dateOfBirth ? <RNText style={{ color: "#BDB4A3", fontFamily: fonts.medium, fontSize: 13 }}>{t("Born")}{" "}{formatDob(user.dateOfBirth)}</RNText> : null}
          </View>
        </Row>
        <View style={{ flexDirection: "row", backgroundColor: "#211D17", borderRadius: radius.lg, borderWidth: 1, borderColor: "#3A3328" }}>
          {[
            [String(total), t("Bookings")],
            [String(completed), t("Completed")],
            [String(addresses.data?.length ?? 0), t("Addresses")],
          ].map(([n, l], i) => (
            <View key={l} style={{ flex: 1, alignItems: "center", paddingVertical: space(3), borderLeftWidth: i ? 1 : 0, borderLeftColor: "#3A3328" }}>
              <RNText style={{ color: colors.goldBright, fontFamily: fonts.extrabold, fontSize: 20 }}>{n}</RNText>
              <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 12 }}>{l}</RNText>
            </View>
          ))}
        </View>
      </View>

      <FreeMaterials compact />

      {editing ? (
        <Card>
          <Input label={t("Full name")} value={name} onChangeText={setName} textContentType="name" />
          <Input label={t("Email (for invoices and Tamara)")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <BirthdayPicker value={dob} onChange={setDob} />
          <ErrorText error={error} />
          <Button title={t("Save changes")} onPress={save} loading={saving} />
        </Card>
      ) : null}

      <Section title={t("Account")}>
        <Item icon="phone" title={t("Mobile number")} subtitle={user.phone ? t("{0} · verified", { 0: user.phone }) : t("Needed to book a service")} onPress={() => router.push("/phone")} />
        <Item icon="pin" title={t("Saved addresses")} subtitle={addresses.data?.length ? addresses.data.map((a) => t(a.area)).join(", ") : t("Add your home or office")} onPress={() => router.push("/addresses")} />
        <Item icon="calendar" title={t("My subscriptions")} subtitle={t("Regular cleaning plans and your visit calendar")} onPress={() => router.push("/subscriptions")} />
        <Item icon="receipt" title={t("Bookings & invoices")} subtitle={t("Past services and receipts")} onPress={() => router.push("/bookings")} />
        <Item icon="bell" title={t("Notifications")} subtitle={t("Booking updates and offers")} onPress={() => router.push("/notifications")} />
        <Item icon="key" title={t("Sign-in methods")} subtitle={user.signInMethods.map((m) => t(METHOD_LABEL[m] ?? m)).join(", ") || "—"} last={!missing.length} />
        {missing.length ? (
          <Row style={{ flexWrap: "wrap", gap: space(2), paddingHorizontal: space(4), paddingBottom: space(3) }}>
            {missing.map((p) => (
              <Button key={p} title={t("Connect {0}", { 0: t(METHOD_LABEL[p]) })} size="sm" variant="secondary" onPress={() => link(p)} />
            ))}
          </Row>
        ) : null}
      </Section>

      <PlanPromo />

      <LanguageSection />

      <Appearance />

      <Section title={t("Rewards")}>
        <Item icon="tag" title={t("Invite friends")} subtitle={t("Give your friends a discount, get credit for every booking")} onPress={() => router.push("/invite")} last />
      </Section>

      <Section title={t("Help & support")}>
        <Item icon="chat" title={t("Chat with us")} subtitle={t("Instant answers, or reply from our team")} onPress={() => router.push("/chat")} />
        <Item icon="chat" title={t("WhatsApp")} subtitle={company.data?.phoneDisplay} onPress={() => company.data && open(company.data.whatsapp)} />
        <Item icon="call" title={t("Call us")} subtitle="+971 2 675 6844" onPress={() => company.data && open(`tel:${company.data.phone}`)} />
        <Item icon="mail" title={t("Email")} subtitle={company.data?.email} onPress={() => company.data && open(`mailto:${company.data.email}`)} last />
      </Section>

      <Section title={t("About")}>
        <Item icon="globe" title={t("About Xtreme")} subtitle={t("www.xtreme-fmgroup.com")} onPress={() => company.data && open(company.data.website)} />
        <Item icon="shield" title={t("Privacy policy")} onPress={() => open(`${API_URL}/privacy`)} />
        <Item icon="trash" title={t("Delete account")} subtitle={t("Erase your profile and data")} danger onPress={confirmDelete} last />
      </Section>

      <Pressable onPress={signOut} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2), backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: space(4) })}>
        <LineIcon name="logout" size={20} color={colors.text} />
        <Text style={{ fontFamily: fonts.bold }}>{t("Sign out")}</Text>
      </Pressable>

      <View style={{ alignItems: "center", gap: space(1), marginTop: space(2) }}>
        <Image source={require("../../../assets/logo-mark.png")} style={{ width: 52, height: 40, opacity: 0.9 }} resizeMode="contain" />
        <Text style={{ fontFamily: fonts.bold, fontSize: 13 }}>{t("Xtreme Facilities Management")}</Text>
        <Text variant="small" style={{ textAlign: "center" }}>
          {t("Mazyad Offices T-1, Abu Dhabi · Version 1.0.0")}{DEMO ? t(" · demo") : ""}
        </Text>
      </View>
    </Screen>
  );
}

const THEMES: [ThemeMode, LineIconName, string][] = [
  ["light", "sun", "Light"],
  ["dark", "moon", "Dark"],
  ["system", "auto", "Auto"],
];

function LanguageSection() {
  const { lang, setLang } = useLanguage();
  function choose(l: Lang) {
    if (l === lang) return;
    setLang(l);
    // The app redraws in the new language from the home screen; come back here.
    setTimeout(() => router.navigate("/account"), 80);
  }
  return (
    <Section title={t("Language")}>
      <View style={{ flexDirection: "row", gap: space(2), padding: space(3) }}>
        {([["en", "English", "PlusJakartaSans_700Bold"], ["ar", "العربية", "Tajawal_700Bold"]] as const).map(([l, label, font]) => {
          const on = l === lang;
          return (
            <Pressable
              key={l}
              onPress={() => choose(l)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2), paddingVertical: space(3), borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? colors.gold : colors.border, backgroundColor: on ? colors.goldSoft : colors.surface }}
            >
              <LineIcon name="globe" size={20} color={iconColor("globe")} />
              <RNText style={{ color: on ? colors.gold : colors.text, fontFamily: font, fontSize: 15 }}>{label}</RNText>
            </Pressable>
          );
        })}
      </View>
    </Section>
  );
}

function Appearance() {
  const { mode, setMode } = useThemeMode();
  function choose(m: ThemeMode) {
    if (m === mode) return;
    setMode(m);
    // The app redraws in the new theme from the home screen; come back here.
    setTimeout(() => router.navigate("/account"), 80);
  }
  return (
    <Section title={t("Appearance")}>
      <View style={{ flexDirection: "row", gap: space(2), padding: space(3) }}>
        {THEMES.map(([m, icon, label]) => {
          const on = m === mode;
          return (
            <Pressable
              key={m}
              onPress={() => choose(m)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{ flex: 1, alignItems: "center", gap: 4, paddingVertical: space(3), borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? colors.gold : colors.border, backgroundColor: on ? colors.goldSoft : colors.surface }}
            >
              <LineIcon name={icon} size={22} color={iconColor(icon)} />
              <RNText style={{ color: on ? colors.gold : colors.text, fontFamily: fonts.bold, fontSize: 13 }}>{t(label)}</RNText>
            </Pressable>
          );
        })}
      </View>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space(2) }}>
      <Text variant="label" style={{ marginLeft: space(1) }}>
        {title.toUpperCase()}
      </Text>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.card }}>{children}</View>
    </View>
  );
}

function Item({ icon, title, subtitle, onPress, danger, last }: { icon: LineIconName; title: string; subtitle?: string; onPress?: () => void; danger?: boolean; last?: boolean }) {
  const tint = danger ? colors.danger : iconColor(icon);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3.5), backgroundColor: pressed ? colors.surfaceAlt : "transparent", borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.divider })}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: danger ? colors.dangerSoft : iconSoft(icon), alignItems: "center", justifyContent: "center" }}>
        <LineIcon name={icon} size={20} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.semibold, color: danger ? colors.danger : colors.text }}>{title}</Text>
        {subtitle ? (
          <Text variant="small" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onPress ? <RNText style={{ color: colors.faint, fontSize: 22 }}>›</RNText> : null}
    </Pressable>
  );
}
