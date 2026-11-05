import { useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text as RNText, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { InlineLoader, Text } from "@/components/ui";
import { LineIcon } from "@/components/LineIcon";
import { api } from "@/lib/api";
import { maskedCall } from "@/lib/calls";
import { dateLocale, t } from "@/lib/i18n";
import { colors, fonts, radius, shadow, space } from "@/lib/theme";

interface JobMessage {
  id: string;
  sender: "customer" | "staff" | "admin";
  senderName: string;
  mine: boolean;
  body: string;
  redacted: boolean;
  createdAt: string;
}
interface Thread {
  open: boolean;
  notice: string;
  messages: JobMessage[];
}

const time = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });

/**
 * Chat between the customer and the team on a booking. Phone numbers, emails and messaging
 * links are removed by the server, so neither side can share contact details; calls use
 * Xtreme's masked number instead.
 */
export function JobChat({ bookingId, title, canCall }: { bookingId: string; title: string; canCall: boolean }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const list = useRef<FlatList<JobMessage>>(null);

  const load = () =>
    api<Thread>(`/bookings/${bookingId}/messages`)
      .then(setThread)
      .catch((e) => setError(e instanceof Error ? e.message : t("Could not load the chat")));

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [bookingId]);

  useEffect(() => {
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 80);
  }, [thread?.messages.length]);

  async function send() {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await api<{ message: JobMessage; redacted: boolean; notice?: string }>(`/bookings/${bookingId}/messages`, { body: { body: msg } });
      setText("");
      setWarning(r.redacted ? t("Phone numbers, emails and messaging links can't be shared in chat. Use the Call button: it keeps both numbers private.") : null);
      setThread((th) => (th ? { ...th, messages: [...th.messages, r.message] } : th));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Message not sent"));
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90} style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.ink, paddingHorizontal: space(4), paddingVertical: space(3), flexDirection: "row", alignItems: "center", gap: space(3) }}>
          <View style={{ flex: 1 }}>
            <RNText style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 15 }} numberOfLines={1}>{title}</RNText>
            <RNText style={{ color: "#A79E8D", fontFamily: fonts.medium, fontSize: 12 }}>{t("Numbers stay private")}</RNText>
          </View>
          {canCall ? (
            <Pressable onPress={() => void maskedCall(bookingId)} accessibilityRole="button" accessibilityLabel={t("Call")} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.goldBright, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(2) }}>
              <LineIcon name="call" size={16} color="#16130E" />
              <RNText style={{ color: "#16130E", fontFamily: fonts.bold, fontSize: 13 }}>{t("Call")}</RNText>
            </Pressable>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", gap: space(2), alignItems: "center", backgroundColor: colors.goldSoft, paddingHorizontal: space(4), paddingVertical: space(2) }}>
          <LineIcon name="shield" size={16} color={colors.gold} />
          <RNText style={{ flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 12 }}>
            {t("For your safety, phone numbers and contact details are hidden. Xtreme can read this chat.")}
          </RNText>
        </View>

        {!thread && !error ? <InlineLoader label={t("Opening chat…")} /> : null}
        <FlatList
          ref={list}
          data={thread?.messages ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space(4), gap: space(3), flexGrow: 1 }}
          renderItem={({ item }) => <Bubble m={item} />}
          ListEmptyComponent={thread ? <Text variant="small" style={{ textAlign: "center", marginTop: space(6) }}>{t("No messages yet. Say hello!")}</Text> : null}
        />

        {warning ? <Text style={{ color: colors.gold, paddingHorizontal: space(4), fontSize: 12.5, fontFamily: fonts.semibold }}>{warning}</Text> : null}
        {error ? <Text style={{ color: colors.danger, paddingHorizontal: space(4), fontSize: 13 }}>{error}</Text> : null}
        {thread && !thread.open ? (
          <Text variant="small" style={{ textAlign: "center", paddingVertical: space(3) }}>{t("This chat is closed.")}</Text>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space(2), paddingHorizontal: space(3), paddingVertical: space(2.5), backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t("Type your message…")}
              placeholderTextColor={colors.faint}
              multiline
              maxLength={1000}
              style={{ flex: 1, maxHeight: 110, minHeight: 46, backgroundColor: colors.bg, borderRadius: 23, paddingHorizontal: space(4), paddingTop: 13, paddingBottom: 12, fontFamily: fonts.medium, fontSize: 15, color: colors.text }}
            />
            <Pressable
              onPress={send}
              disabled={!text.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel={t("Send")}
              style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: text.trim() ? colors.ink : colors.border, alignItems: "center", justifyContent: "center" }}
            >
              <RNText style={{ color: text.trim() ? colors.goldBright : colors.faint, fontSize: 20, fontFamily: fonts.bold, marginLeft: 2 }}>➤</RNText>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ m }: { m: JobMessage }) {
  return (
    <View style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "84%", gap: 3 }}>
      {!m.mine ? (
        <RNText style={{ fontFamily: fonts.bold, fontSize: 11.5, color: m.sender === "admin" ? colors.success : colors.gold, marginLeft: 4 }}>{m.sender === "admin" ? t("Xtreme team") : m.senderName}</RNText>
      ) : null}
      <View
        style={{
          backgroundColor: m.mine ? colors.ink : colors.surface,
          borderRadius: 18,
          borderBottomRightRadius: m.mine ? 6 : 18,
          borderBottomLeftRadius: m.mine ? 18 : 6,
          paddingHorizontal: space(3.5),
          paddingVertical: space(2.5),
          borderWidth: m.mine ? 0 : 1,
          borderColor: colors.border,
          ...shadow.card,
        }}
      >
        <RNText style={{ color: m.mine ? "#fff" : colors.text, fontFamily: fonts.medium, fontSize: 14.5, lineHeight: 21 }}>{m.body}</RNText>
      </View>
      <RNText style={{ fontSize: 10.5, color: colors.faint, alignSelf: m.mine ? "flex-end" : "flex-start", marginHorizontal: 4 }}>
        {time(m.createdAt)}
        {m.redacted ? ` · ${t("contact details hidden")}` : ""}
      </RNText>
    </View>
  );
}
