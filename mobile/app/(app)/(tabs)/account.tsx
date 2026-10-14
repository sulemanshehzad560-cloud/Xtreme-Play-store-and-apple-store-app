import { useState } from "react";
import { Alert, Linking, Platform, View } from "react-native";
import { router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import { AccessToken, LoginManager } from "react-native-fbsdk-next";
import { Avatar, Button, Card, Divider, ErrorText, Input, ListItem, Row, Screen, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DEMO } from "@/lib/demo";
import { colors, fonts, space } from "@/lib/theme";
import type { Company } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const METHOD_LABEL: Record<string, string> = { phone: "Mobile", google: "Google", facebook: "Facebook", apple: "Apple" };

export default function Account() {
  const { user, refreshUser, signOut } = useAuth();
  const company = useApi<Company>("/company");
  const addresses = useApi<{ id: string; label: string; area: string }[]>("/me/addresses");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!user) return null;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api("/me", { method: "PATCH", body: { fullName: name.trim() || undefined, email: email.trim() || null } });
      await refreshUser();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
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
      if (e instanceof Error && !/cancel/i.test(e.message)) Alert.alert("Could not connect", e.message);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete your account?", "Your profile, addresses and sign-in methods are erased and open bookings are cancelled (paid ones refunded). This can't be undone.", [
      { text: "Keep my account", style: "cancel" },
      {
        text: "Delete",
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

  return (
    <Screen>
      <Text variant="title">Account</Text>

      <Card>
        <Row>
          <Avatar name={user.fullName ?? user.phone ?? "You"} size={60} />
          <View style={{ flex: 1 }}>
            <Text variant="heading">{user.fullName ?? "Add your name"}</Text>
            <Text variant="small">{user.phone ?? "No mobile number yet"}</Text>
            {user.email ? <Text variant="small">{user.email}</Text> : null}
          </View>
          <Text onPress={() => setEditing(!editing)} style={{ color: colors.gold, fontFamily: fonts.bold }}>
            {editing ? "Close" : "Edit"}
          </Text>
        </Row>
        {editing ? (
          <View style={{ gap: space(3), marginTop: space(2) }}>
            <Input label="Full name" value={name} onChangeText={setName} textContentType="name" />
            <Input label="Email (for receipts and Tamara)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <ErrorText error={error} />
            <Button title="Save changes" onPress={save} loading={saving} />
          </View>
        ) : null}
      </Card>

      <Card style={{ gap: 0, paddingVertical: space(2) }}>
        <ListItem icon="📱" title="Mobile number" subtitle={user.phone ? `${user.phone} · verified` : "Needed to book a service"} onPress={() => router.push("/phone")} />
        <Divider />
        <ListItem icon="📍" title="Saved addresses" subtitle={addresses.data?.length ? addresses.data.map((a) => a.area).join(", ") : "Added when you book"} />
        <Divider />
        <ListItem icon="🔑" title="Sign-in methods" subtitle={user.signInMethods.map((m) => METHOD_LABEL[m] ?? m).join(", ") || "—"} />
        {missing.length ? (
          <Row style={{ flexWrap: "wrap", gap: space(2), paddingBottom: space(2) }}>
            {missing.map((p) => (
              <Button key={p} title={`Connect ${METHOD_LABEL[p]}`} size="sm" variant="secondary" onPress={() => link(p)} />
            ))}
          </Row>
        ) : null}
      </Card>

      <Text variant="heading">Help & support</Text>
      <Card style={{ gap: 0, paddingVertical: space(2) }}>
        <ListItem icon="💬" title="Chat on WhatsApp" subtitle={company.data?.phoneDisplay} onPress={() => company.data && Linking.openURL(company.data.whatsapp)} />
        <Divider />
        <ListItem icon="📞" title="Call us" subtitle="+971 2 675 6844" onPress={() => company.data && Linking.openURL(`tel:${company.data.phone}`)} />
        <Divider />
        <ListItem icon="✉️" title="Email" subtitle={company.data?.email} onPress={() => company.data && Linking.openURL(`mailto:${company.data.email}`)} />
        <Divider />
        <ListItem icon="🌐" title="About Xtreme" subtitle="www.xtreme-fmgroup.com" onPress={() => company.data && Linking.openURL(company.data.website)} />
      </Card>

      <Card style={{ gap: 0, paddingVertical: space(2) }}>
        <ListItem icon="🚪" title="Sign out" onPress={signOut} />
        <Divider />
        <ListItem icon="🗑️" title="Delete account" danger onPress={confirmDelete} />
      </Card>
      <Text variant="small" style={{ textAlign: "center" }}>
        Xtreme-Home Partner · version 1.0.0{DEMO ? " · demo build" : ""}
      </Text>
    </Screen>
  );
}
