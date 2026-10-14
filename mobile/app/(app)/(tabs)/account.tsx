import { useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import { router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import { AccessToken, LoginManager } from "react-native-fbsdk-next";
import { Button, Card, ErrorText, Input, Row, Screen, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Company } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function Account() {
  const { user, refreshUser, signOut } = useAuth();
  const company = useApi<Company>("/company");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function link(provider: "google" | "facebook" | "apple") {
    try {
      let token: string | null = null;
      let nonce: string | undefined;
      if (provider === "google") {
        const r = await GoogleSignin.signIn();
        token = isSuccessResponse(r) ? r.data.idToken : null;
      } else if (provider === "facebook") {
        const r = await LoginManager.logInWithPermissions(["public_profile", "email"]);
        token = r.isCancelled ? null : ((await AccessToken.getCurrentAccessToken())?.accessToken ?? null);
      } else {
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
    Alert.alert(
      "Delete your account?",
      "Your profile, addresses and sign-in methods are erased and open bookings are cancelled (paid ones refunded). This cannot be undone.",
      [
        { text: "Keep my account", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await api("/me", { method: "DELETE" });
            await signOut();
          },
        },
      ],
    );
  }

  const has = (p: string) => user.signInMethods.includes(p);
  return (
    <Screen>
      <Text variant="title">Account</Text>
      <Card>
        <Input label="Full name" value={name} onChangeText={setName} textContentType="name" />
        <Input label="Email (for receipts and Tamara)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <ErrorText error={error} />
        <Button title="Save" onPress={save} loading={saving} />
      </Card>

      <Card>
        <Text variant="gold">Mobile number</Text>
        <Text>{user.phone ?? "Not added yet. Needed to book."}</Text>
        <Button title={user.phone ? "Change number" : "Add mobile number"} variant="secondary" onPress={() => router.push("/phone")} />
      </Card>

      <Card>
        <Text variant="gold">Sign-in methods</Text>
        <Text variant="small">Connected: {user.signInMethods.join(", ")}</Text>
        <Row style={{ flexWrap: "wrap" }}>
          {!has("google") ? <Button title="Connect Google" variant="secondary" onPress={() => link("google")} /> : null}
          {!has("facebook") ? <Button title="Connect Facebook" variant="secondary" onPress={() => link("facebook")} /> : null}
          {!has("apple") && Platform.OS === "ios" ? <Button title="Connect Apple" variant="secondary" onPress={() => link("apple")} /> : null}
        </Row>
      </Card>

      {company.data ? (
        <Card>
          <Text variant="gold">{company.data.name}</Text>
          <Text variant="muted">
            {company.data.address.line1}, {company.data.address.city}
          </Text>
          <Button title={`WhatsApp ${company.data.phoneDisplay}`} variant="secondary" onPress={() => Linking.openURL(company.data!.whatsapp)} />
          <Button title={`Email ${company.data.email}`} variant="ghost" onPress={() => Linking.openURL(`mailto:${company.data!.email}`)} />
          <Button title="Website" variant="ghost" onPress={() => Linking.openURL(company.data!.website)} />
        </Card>
      ) : null}

      <Button title="Sign out" variant="secondary" onPress={signOut} />
      <Button title="Delete account" variant="danger" onPress={confirmDelete} />
    </Screen>
  );
}
