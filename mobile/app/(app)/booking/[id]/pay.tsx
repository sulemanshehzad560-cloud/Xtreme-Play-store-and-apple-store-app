import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { initStripe, useStripe } from "@stripe/stripe-react-native";
import { Button, Card, ErrorText, Row, Screen, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { aed } from "@/lib/format";
import { colors } from "@/lib/theme";

interface Options {
  amount: { totalAed: number; vatAed: number };
  methods: { method: "card" | "tamara" | "cash"; available: boolean; label: string }[];
}
interface CardStart {
  paymentId: string;
  stripe: {
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
  tamara: { checkoutUrl: string; returnUrlPrefix: string };
}
interface PaymentView {
  status: string;
}

export default function Pay() {
  const { id, method: preselected } = useLocalSearchParams<{ id: string; method?: "card" | "tamara" }>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [options, setOptions] = useState<Options | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Options>(`/bookings/${id}/payment-options`)
      .then(setOptions)
      .catch((e) => setError(e.message));
  }, [id]);

  async function finish(paymentId: string) {
    // The webhook usually lands first; syncing makes the result instant either way.
    const p = await api<PaymentView>(`/payments/${paymentId}/sync`, { body: {} });
    if (p.status === "captured") {
      Alert.alert("Payment received", "Thank you! Your booking is paid.");
      router.dismissTo(`/booking/${id}`);
    } else if (p.status === "pending") {
      setError("Payment not completed. You can try again.");
    } else {
      setError("The payment didn't go through. Please try another method.");
    }
  }

  async function payByCard() {
    setBusy("card");
    setError(null);
    try {
      const start = await api<CardStart>(`/bookings/${id}/payments`, { body: { method: "card" } });
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
        appearance: { colors: { primary: colors.gold, background: colors.bg, componentBackground: colors.card, primaryText: colors.text } },
      });
      if (init.error) throw new Error(init.error.message);
      const result = await presentPaymentSheet();
      if (result.error) {
        if (result.error.code !== "Canceled") setError(result.error.message);
        return;
      }
      await finish(start.paymentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Card payment failed");
    } finally {
      setBusy(null);
    }
  }

  async function payByTamara() {
    setBusy("tamara");
    setError(null);
    try {
      const start = await api<TamaraStart>(`/bookings/${id}/payments`, { body: { method: "tamara" } });
      await WebBrowser.openAuthSessionAsync(start.tamara.checkoutUrl, start.tamara.returnUrlPrefix);
      await finish(start.paymentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tamara payment failed");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!options) return;
    if (preselected === "card") void payByCard();
    if (preselected === "tamara") void payByTamara();
  }, [options !== null]);

  return (
    <Screen>
      <Text variant="title">Pay for your booking</Text>
      {options ? (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <Text variant="muted">Total</Text>
            <Text variant="heading" style={{ color: colors.goldHi }}>
              {aed(options.amount.totalAed)}
            </Text>
          </Row>
          <Text variant="small">Includes VAT of {aed(options.amount.vatAed)}</Text>
        </Card>
      ) : null}
      {options?.methods.map((m) =>
        m.method === "cash" ? (
          <Button key={m.method} title={m.label} variant="ghost" onPress={() => router.dismissTo(`/booking/${id}`)} />
        ) : (
          <Button
            key={m.method}
            title={m.label}
            variant={m.method === "card" ? "primary" : "secondary"}
            disabled={!m.available}
            loading={busy === m.method}
            onPress={m.method === "card" ? payByCard : payByTamara}
          />
        ),
      )}
      <ErrorText error={error} />
      <Text variant="small">Card details are handled securely by Stripe and never stored by Xtreme. Cancelled bookings are refunded automatically.</Text>
    </Screen>
  );
}
