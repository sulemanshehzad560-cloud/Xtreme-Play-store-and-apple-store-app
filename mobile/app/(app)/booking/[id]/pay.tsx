import { useEffect, useState } from "react";
import { Pressable, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { initStripe, useStripe } from "@stripe/stripe-react-native";
import { TamaraBadge } from "@/components/BrandIcons";
import { Button, Card, ErrorText, InlineLoader, Input, Notice, OptionCard, Row, Screen, StickyFooter, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { DEMO } from "@/lib/demo";
import { aed, when } from "@/lib/format";
import type { Booking } from "@/lib/types";
import { colors, fonts, space } from "@/lib/theme";
import { LineIcon, iconColor } from "@/components/LineIcon";
import { t } from "@/lib/i18n";

interface Options {
  amount: { priceAed: number; discountAed: number; totalAed: number; serviceFeeAed?: number; serviceFeePercent?: number };
  promoCode: string | null;
  methods: { method: "card" | "tamara"; available: boolean; label: string; feeAed?: number; feePercent?: number; totalAed?: number; instalments?: number }[];
}
interface CardStart {
  paymentId: string;
  /** Network International: the card is entered on N-Genius's secure page. */
  hosted?: { url: string; returnUrlPrefix: string };
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
  const [booking, setBooking] = useState<Booking | null>(null);
  const [code, setCode] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoNote, setPromoNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [method, setMethod] = useState<"card" | "tamara">(preselected ?? "card");
  // Optional tip for the team, passed on in full.
  const [tip, setTip] = useState(0);
  const [tipOpen, setTipOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    Promise.all([api<Options>(`/bookings/${id}/payment-options`), api<Booking>(`/bookings/${id}`)])
      .then(([o, b]) => {
        setOptions(o);
        setBooking(b);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    void load();
  }, [id]);

  async function applyCode() {
    if (!code.trim()) return;
    setPromoBusy(true);
    setPromoNote(null);
    try {
      const r = await api<Booking & { promoMessage?: string }>(`/bookings/${id}/promo`, { body: { code: code.trim() } });
      setPromoNote({ text: r.promoMessage ?? t("Code applied"), ok: true });
      setCode("");
      await load();
    } catch (e) {
      setPromoNote({ text: e instanceof Error ? e.message : t("This code could not be applied"), ok: false });
    } finally {
      setPromoBusy(false);
    }
  }

  async function removeCode() {
    setPromoBusy(true);
    setPromoNote(null);
    try {
      await api(`/bookings/${id}/promo`, { method: "DELETE" });
      await load();
    } catch (e) {
      setPromoNote({ text: e instanceof Error ? e.message : t("Could not remove the code"), ok: false });
    } finally {
      setPromoBusy(false);
    }
  }

  async function finish(paymentId: string) {
    // The webhook usually lands first; syncing makes the result instant either way.
    const p = await api<{ status: string }>(`/payments/${paymentId}/sync`, { body: {} });
    if (p.status === "captured") {
      router.dismissTo(`/booking/${id}?paid=1`);
    } else if (p.status === "pending") setError(t("The payment wasn't completed. You can try again."));
    else setError(t("The payment didn't go through. Please try another method."));
  }

  async function payByCard() {
    const start = await api<CardStart>(`/bookings/${id}/payments`, { body: { method: "card", ...(tip ? { tipAed: tip } : {}) } });
    if (!DEMO && start.hosted) {
      await WebBrowser.openAuthSessionAsync(start.hosted.url, start.hosted.returnUrlPrefix);
      return finish(start.paymentId);
    }
    if (DEMO || !start.stripe) return finish(start.paymentId);
    const s = start.stripe;
    await initStripe({ publishableKey: s.publishableKey, merchantIdentifier: "merchant.ae.xtremefm.app", urlScheme: "xtreme" });
    const init = await initPaymentSheet({
      merchantDisplayName: s.merchantDisplayName,
      paymentIntentClientSecret: s.paymentIntentClientSecret,
      customerId: s.customerId,
      customerEphemeralKeySecret: s.customerEphemeralKeySecret,
      ...(Constants.expoConfig?.extra?.applePay ? { applePay: { merchantCountryCode: s.merchantCountryCode } } : {}),
      googlePay: { merchantCountryCode: s.merchantCountryCode, currencyCode: s.currency, testEnv: s.publishableKey.startsWith("pk_test") },
      returnURL: "xtreme://stripe-redirect",
      appearance: sheetAppearance(),
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
    const start = await api<TamaraStart>(`/bookings/${id}/payments`, { body: { method: "tamara", ...(tip ? { tipAed: tip } : {}) } });
    if (!DEMO && start.tamara) await WebBrowser.openAuthSessionAsync(start.tamara.checkoutUrl, start.tamara.returnUrlPrefix);
    await finish(start.paymentId);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      if (method === "card") await payByCard();
      else await payByTamara();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Payment failed"));
    } finally {
      setBusy(false);
    }
  }

  const chosen = options?.methods.find((x) => x.method === method);
  const tamara = options?.methods.find((x) => x.method === "tamara");
  const fee = chosen?.feeAed ?? 0;
  const serviceFee = options?.amount.serviceFeeAed ?? 0;
  const methodFee = Math.round((fee - serviceFee) * 100) / 100;
  const total = options ? (chosen?.totalAed ?? options.amount.totalAed) + tip : undefined;
  const available = (m: string) => options?.methods.find((x) => x.method === m)?.available ?? false;

  return (
    <Screen
      edges={["left", "right"]}
      footer={
        <StickyFooter>
          <Button title={total != null ? t("Pay {0}", { 0: aed(total) }) : t("Pay")} onPress={confirm} loading={busy} disabled={!options} style={{ flex: 1 }} />
        </StickyFooter>
      }
    >
      {!options && !error ? <InlineLoader label={t("Getting your payment options…")} /> : null}
      {options ? (
        <>
          <Card tone="ink" style={{ gap: space(2.5) }}>
            <View>
              <Text style={{ color: colors.goldBright, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2 }}>{t("ORDER SUMMARY")}</Text>
              {booking ? (
                <>
                  <Text style={{ color: colors.onInk, fontFamily: fonts.extrabold, fontSize: 19, marginTop: space(1) }}>{t(booking.service.name)}</Text>
                  <Text style={{ color: "#BDB4A3", fontSize: 13.5, marginTop: 2 }}>
                    {booking.reference} · {when(booking.scheduledAt)}
                  </Text>
                </>
              ) : null}
            </View>
            <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.12)" }} />
            <SummaryLine label={t("Service price")} value={aed(options.amount.priceAed)} />
            {options.amount.discountAed > 0 ? (
              <SummaryLine label={options.promoCode ? t("Discount ({0})", { 0: options.promoCode }) : t("Discount")} value={`– ${aed(options.amount.discountAed)}`} accent />
            ) : null}
            <SummaryLine label={t("Cleaning materials")} value={t("FREE")} />
            {tip ? <SummaryLine label={t("Tip for your team")} value={aed(tip)} /> : null}
            {serviceFee > 0 ? <SummaryLine label={options.amount.serviceFeePercent ? t("Service fee ({0}%)", { 0: options.amount.serviceFeePercent }) : t("Service fee")} value={aed(serviceFee)} /> : null}
            {methodFee > 0 ? <SummaryLine label={t("{0} fee ({1}%)", { 0: method === "tamara" ? "Tamara" : "Card", 1: chosen?.feePercent ?? 0 })} value={aed(methodFee)} /> : null}
            <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.12)" }} />
            <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
              <Text style={{ color: "#BDB4A3", fontFamily: fonts.semibold }}>{t("Total to pay")}</Text>
              <Text style={{ color: colors.onInk, fontFamily: fonts.extrabold, fontSize: 28 }}>{aed(total ?? options.amount.totalAed)}</Text>
            </Row>
            <Text style={{ color: "#BDB4A3", fontSize: 12.5 }}>{method === "tamara" ? t("Tamara fee added for paying in instalments · no hidden charges") : t("No hidden charges · your tax invoice is emailed after payment")}</Text>
          </Card>

          {options.amount.discountAed > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), backgroundColor: colors.successSoft, borderRadius: 14, padding: space(3) }}>
              <LineIcon name="tag" size={20} color={colors.success} />
              <Text style={{ flex: 1, color: colors.success, fontFamily: fonts.bold }}>{t("You save")}{" "}{aed(options.amount.discountAed)}{" "}{t("on this booking")}</Text>
            </View>
          ) : null}

          <Card style={{ gap: space(2) }}>
            <Text variant="subheading">{t("Promo code")}</Text>
            {options.promoCode ? (
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ backgroundColor: colors.goldSoft, borderRadius: 8, paddingHorizontal: space(2.5), paddingVertical: space(1) }}>
                  <Text style={{ color: colors.gold, fontFamily: fonts.extrabold, letterSpacing: 1 }}>{options.promoCode}</Text>
                </View>
                <Text onPress={promoBusy ? undefined : removeCode} style={{ color: colors.danger, fontFamily: fonts.bold }}>
                  {t("Remove")}
                </Text>
              </Row>
            ) : (
              <Row style={{ gap: space(2), alignItems: "flex-end" }}>
                <View style={{ flex: 1 }}>
                  <Input
                    value={code}
                    onChangeText={(t) => setCode(t.toUpperCase())}
                    placeholder={t("Enter code")}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={24}
                    returnKeyType="done"
                    onSubmitEditing={applyCode}
                  />
                </View>
                <Button title={t("Apply")} variant="secondary" size="sm" onPress={applyCode} loading={promoBusy} disabled={!code.trim()} style={{ minHeight: 50 }} />
              </Row>
            )}
            {promoNote ? <Text style={{ color: promoNote.ok ? colors.success : colors.danger, fontFamily: fonts.semibold, fontSize: 13.5 }}>{promoNote.text}</Text> : null}
          </Card>

          {tipOpen || tip ? (
            <Card style={{ gap: space(2.5) }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={{ fontFamily: fonts.bold }}>{t("Tip your team")}</Text>
                <Text
                  onPress={() => {
                    setTip(0);
                    setTipOpen(false);
                  }}
                  style={{ color: colors.muted, fontFamily: fonts.semibold, fontSize: 13.5 }}
                >
                  {t("No thanks")}
                </Text>
              </Row>
              <Row style={{ gap: space(2) }}>
                {[10, 20, 30].map((v) => (
                  <Pressable
                    key={v}
                    onPress={() => setTip(tip === v ? 0 : v)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: tip === v }}
                    style={{ flex: 1, alignItems: "center", paddingVertical: space(2.5), borderRadius: 12, borderWidth: 1.5, borderColor: tip === v ? colors.gold : colors.border, backgroundColor: tip === v ? colors.goldSoft : colors.surface }}
                  >
                    <RNText style={{ color: colors.text, fontFamily: tip === v ? fonts.extrabold : fonts.semibold, fontSize: 14 }}>{aed(v)}</RNText>
                  </Pressable>
                ))}
              </Row>
              <Text variant="small">{t("Completely optional. 100% goes to the cleaners who visit you.")}</Text>
            </Card>
          ) : (
            <Pressable
              onPress={() => setTipOpen(true)}
              accessibilityRole="button"
              style={{ flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(1), paddingHorizontal: space(1) }}
            >
              <LineIcon name="heart" size={18} color={colors.gold} />
              <Text style={{ flex: 1, color: colors.muted, fontSize: 14 }}>
                {t("Want to thank your team?")}{" "}<Text style={{ color: colors.gold, fontFamily: fonts.bold, fontSize: 14 }}>{t("Add a tip")}</Text>
              </Text>
            </Pressable>
          )}

          <Text variant="heading">{t("Choose how to pay")}</Text>
          <OptionCard
            selected={method === "card"}
            disabled={!available("card")}
            onPress={() => setMethod("card")}
            title={t("Credit or debit card")}
            subtitle={t("Visa, Mastercard, Apple Pay, Google Pay")}
            icon={<LineIcon name="card" size={24} color={iconColor("card")} />}
          />
          <OptionCard
            selected={method === "tamara"}
            disabled={!available("tamara")}
            onPress={() => setMethod("tamara")}
            title={t("Pay in 4 with Tamara")}
            subtitle={
              tamara?.totalAed
                ? t("4 payments of {0} · includes {1}% Tamara fee", { 0: aed(Math.round(((tamara.totalAed + tip) / 4) * 100) / 100), 1: tamara.feePercent ?? 8 })
                : t("Pay in instalments")
            }
            icon={<TamaraBadge />}
          />

          <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), justifyContent: "center", marginTop: space(2) }}>
            <LineIcon name="lock" size={15} color={iconColor("lock")} />
            <Text variant="small" style={{ fontFamily: fonts.medium }}>
              {t("Payments are encrypted and processed securely.")}
            </Text>
          </View>
          <Notice tone="info">{t("Your booking is confirmed as soon as the payment goes through.")}</Notice>
          {DEMO ? <Notice>{t("Demo build: no real payment is taken. Tapping Pay marks the booking as paid.")}</Notice> : null}
        </>
      ) : null}
      <ErrorText error={error} />
    </Screen>
  );
}

function SummaryLine({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <Text style={{ color: accent ? colors.goldBright : "#D9D2C4", fontFamily: fonts.semibold }}>{label}</Text>
      <Text style={{ color: accent ? colors.goldBright : colors.onInk, fontFamily: fonts.bold }}>{value}</Text>
    </Row>
  );
}

/**
 * Card sheet colours in the app's current theme. Every colour is set, for both the phone's light
 * and dark modes, so text is never white on a light field (or dark on a dark one).
 */
function sheetAppearance() {
  const palette = {
    primary: colors.gold,
    background: colors.surface,
    componentBackground: colors.bg,
    componentBorder: colors.border,
    componentDivider: colors.border,
    primaryText: colors.text,
    secondaryText: colors.muted,
    componentText: colors.text,
    placeholderText: colors.faint,
    icon: colors.muted,
    error: colors.danger,
  };
  const button = { background: colors.goldBright, text: "#16130E", border: colors.goldBright };
  return {
    font: { scale: 1.0 },
    shapes: { borderRadius: 14 },
    colors: { light: palette, dark: palette },
    primaryButton: { colors: { light: button, dark: button }, shapes: { borderRadius: 14 } },
  };
}
