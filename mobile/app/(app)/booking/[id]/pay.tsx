import { useEffect, useState } from "react";
import { Alert, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { initStripe, useStripe } from "@stripe/stripe-react-native";
import { TamaraBadge } from "@/components/BrandIcons";
import { Button, Card, Divider, ErrorText, InlineLoader, Notice, OptionCard, Row, Screen, StickyFooter, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { DEMO } from "@/lib/demo";
import { aed } from "@/lib/format";
import { colors, fonts, space } from "@/lib/theme";

interface Options {
  amount: { totalAed: number; vatAed: number };
  methods: { method: "card" | "tamara" | "cash"; available: boolean; label: string }[];
}
interface CardStart {
  paymentId: string;
  stripe?: {
    publishableKey: string;
    paymentIntentClientSecret: string;
    customerId: string;
    customerEphemeralKeySecret: string;
    merchantDisplayName: string;
    merchantCountryCode: string;
    currency: string;
  };
}
interface TamaraStart {
  paymentId: string;
  tamara?: { checkoutUrl: string; returnUrlPrefix: string };
}

export default function Pay() {
  const { id, method: preselected } = useLocalSearchParams<{ id: string; method?: "card" | "tamara" }>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [options, setOptions] = useState<Options | null>(null);
  const [method, setMethod] = useState<"card" | "tamara" | "cash">(preselected ?? "card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Options>(`/bookings/${id}/payment-options`)
      .then(setOptions)
      .catch((e) => setError(e.message));
  }, [id]);

  async function finish(paymentId: string) {
    // The webhook usually lands first; syncing makes the result instant either way.
    const p = await api<{ status: string }>(`/payments/${paymentId}/sync`, { body: {} });
    if (p.status === "captured") {
      Alert.alert("Payment successful", "Thank you! Your booking is paid.");
      router.dismissTo(`/booking/${id}`);
    } else if (p.status === "pending") setError("The payment wasn't completed. You can try again.");
    else setError("The payment didn't go through. Please try another method.");
  }

  async function payByCard() {
    const start = await api<CardStart>(`/bookings/${id}/payments`, { body: { method: "card" } });
    if (DEMO || !start.stripe) return finish(start.paymentId);
    const s = start.stripe;
    await initStripe({ publishableKey: s.publishableKey, merchantIdentifier: "merchant.ae.xtremefm.app", urlScheme: "xtreme" });
    const init = await initPaymentSheet({
      merchantDisplayName: s.merchantDisplayName,
      paymentIntentClientSecret: s.paymentIntentClientSecret,
      customerId: s.customerId,
      customerEphemeralKeySecret: s.customerEphemeralKeySecret,
      applePay: { merchantCountryCode: s.merchantCountryCode },
      googlePay: { merchantCountryCode: s.merchantCountryCode, currencyCode: s.currency, testEnv: s.publishableKey.startsWith("pk_test") },
      returnURL: "xtreme://stripe-redirect",
      appearance: { colors: { primary: colors.ink, background: colors.surface, componentBackground: colors.bg, primaryText: colors.text } },
    });
    if (init.error) throw new Error(init.error.message);
    const result = await presentPaymentSheet();
    if (result.error) {
      if (result.error.code !== "Canceled") setError(result.error.message);
      return;
    }
    await finish(start.paymentId);
  }

  async function payByTamara() {
    const start = await api<TamaraStart>(`/bookings/${id}/payments`, { body: { method: "tamara" } });
    if (!DEMO && start.tamara) await WebBrowser.openAuthSessionAsync(start.tamara.checkoutUrl, start.tamara.returnUrlPrefix);
    await finish(start.paymentId);
  }

  async function confirm() {
    if (method === "cash") return router.dismissTo(`/booking/${id}`);
    setBusy(true);
    setError(null);
    try {
      if (method === "card") await payByCard();
      else await payByTamara();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  const total = options?.amount.totalAed;
  const available = (m: string) => options?.methods.find((x) => x.method === m)?.available ?? false;

  return (
    <Screen
      edges={["left", "right"]}
      footer={
        <StickyFooter>
          <Button title={method === "cash" ? "Pay on the day" : total != null ? `Pay ${aed(total)}` : "Pay"} onPress={confirm} loading={busy} disabled={!options} style={{ flex: 1 }} />
        </StickyFooter>
      }
    >
      {!options && !error ? <InlineLoader label="Getting your payment options…" /> : null}
      {options ? (
        <>
          <Card>
            <Row style={{ justifyContent: "space-between" }}>
              <Text variant="muted">Amount due</Text>
              <Text variant="price">{aed(options.amount.totalAed)}</Text>
            </Row>
            <Divider />
            <Text variant="small">Includes VAT of {aed(options.amount.vatAed)}</Text>
          </Card>

          <Text variant="heading">Choose how to pay</Text>
          <OptionCard
            selected={method === "card"}
            disabled={!available("card")}
            onPress={() => setMethod("card")}
            title="Credit or debit card"
            subtitle="Visa, Mastercard, Apple Pay, Google Pay"
            icon={<RNText style={{ fontSize: 22 }}>💳</RNText>}
          />
          <OptionCard
            selected={method === "tamara"}
            disabled={!available("tamara")}
            onPress={() => setMethod("tamara")}
            title="Pay in 4 with Tamara"
            subtitle={total ? `4 interest-free payments of ${aed(Math.round((total / 4) * 100) / 100)}` : "Interest-free instalments"}
            icon={<TamaraBadge />}
          />
          <OptionCard selected={method === "cash"} onPress={() => setMethod("cash")} title="Pay on the day" subtitle="Cash or card to the team" icon={<RNText style={{ fontSize: 22 }}>💵</RNText>} />

          <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), justifyContent: "center", marginTop: space(2) }}>
            <RNText style={{ fontSize: 14 }}>🔒</RNText>
            <Text variant="small" style={{ fontFamily: fonts.medium }}>
              Payments are encrypted and processed securely.
            </Text>
          </View>
          {DEMO ? <Notice>Demo build: no real payment is taken. Tapping Pay marks the booking as paid.</Notice> : null}
        </>
      ) : null}
      <ErrorText error={error} />
    </Screen>
  );
}
