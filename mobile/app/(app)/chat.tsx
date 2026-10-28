import { useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Linking, Platform, Pressable, Text as RNText, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandMark } from "@/components/BrandMark";
import { InlineLoader, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, fonts, radius, shadow, space } from "@/lib/theme";
import type { Company } from "@/lib/types";
import { useApi } from "@/lib/useApi";

interface Message {
  id: string;
  sender: "customer" | "bot" | "staff";
  body: string;
  createdAt: string;
}

const QUICK = ["Prices", "Are materials included?", "Which areas do you cover?", "Weekly cleaning", "Payment options", "Cancel or reschedule"];

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** "Chat with us": instant automated answers, and replies from the office in the same thread. */
export default function Chat() {
  const company = useApi<Company>("/company");
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList<Message>>(null);

  const load = () =>
    api<Message[]>("/me/support/messages")
      .then(setMessages)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the chat"));

  useEffect(() => {
    void load();
    // Office replies also arrive as a push notification; this keeps an open chat current.
    const t = setInterval(() => void load(), 6000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 80);
  }, [messages?.length]);

  async function send(body: string) {
    const msg = body.trim();
    if (!msg || sending) return;
    setSending(true);
    setError(null);
    setText("");
    const temp: Message = { id: `tmp-${Date.now()}`, sender: "customer", body: msg, createdAt: new Date().toISOString() };
    setMessages((m) => [...(m ?? []), temp]);
    try {
      const added = await api<Message[]>("/me/support/messages", { body: { body: msg } });
      setMessages((m) => [...(m ?? []).filter((x) => x.id !== temp.id), ...added]);
    } catch (e) {
      setMessages((m) => (m ?? []).filter((x) => x.id !== temp.id));
      setText(msg);
      setError(e instanceof Error ? e.message : "Message not sent");
    } finally {
      setSending(false);
    }
  }

  const welcome: Message = {
    id: "welcome",
    sender: "bot",
    body: "Hi! I'm the Xtreme assistant. Ask about prices, booking, payments or our areas and I'll answer straight away. For anything else, our team replies right here.",
    createdAt: new Date().toISOString(),
  };
  const data = messages ? [welcome, ...messages] : [];

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90} style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.ink, paddingHorizontal: space(4), paddingVertical: space(3), flexDirection: "row", alignItems: "center", gap: space(3) }}>
          <BrandMark size={26} sub="Usually replies in minutes" />
          <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#3DDC84" }} />
            <RNText style={{ color: "#E9E3D6", fontFamily: fonts.semibold, fontSize: 12 }}>Online</RNText>
          </View>
        </View>

        {!messages && !error ? <InlineLoader label="Opening chat…" /> : null}
        <FlatList
          ref={list}
          data={data}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space(4), gap: space(3) }}
          renderItem={({ item }) => <Bubble m={item} />}
          ListFooterComponent={
            messages && messages.length < 2 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2), marginTop: space(2) }}>
                {QUICK.map((q) => (
                  <Pressable key={q} onPress={() => send(q)} style={{ borderWidth: 1.5, borderColor: colors.goldLine, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(2) }}>
                    <RNText style={{ color: colors.gold, fontFamily: fonts.bold, fontSize: 13 }}>{q}</RNText>
                  </Pressable>
                ))}
              </View>
            ) : null
          }
        />

        {error ? <Text style={{ color: colors.danger, paddingHorizontal: space(4), fontSize: 13 }}>{error}</Text> : null}
        {company.data ? (
          <Pressable onPress={() => Linking.openURL(company.data!.whatsapp)} style={{ alignSelf: "center", paddingVertical: space(1.5) }}>
            <RNText style={{ color: colors.muted, fontFamily: fonts.semibold, fontSize: 12.5 }}>
              Prefer WhatsApp? <RNText style={{ color: "#1DA851", fontFamily: fonts.bold }}>Chat on {company.data.phoneDisplay}</RNText>
            </RNText>
          </Pressable>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space(2), paddingHorizontal: space(3), paddingVertical: space(2.5), backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type your message…"
            placeholderTextColor={colors.faint}
            multiline
            maxLength={2000}
            style={{ flex: 1, maxHeight: 110, minHeight: 46, backgroundColor: colors.bg, borderRadius: 23, paddingHorizontal: space(4), paddingTop: 13, paddingBottom: 12, fontFamily: fonts.medium, fontSize: 15, color: colors.text }}
          />
          <Pressable
            onPress={() => send(text)}
            disabled={!text.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: text.trim() ? colors.ink : colors.border, alignItems: "center", justifyContent: "center" }}
          >
            <RNText style={{ color: text.trim() ? colors.goldBright : colors.faint, fontSize: 20, fontFamily: fonts.bold, marginLeft: 2 }}>➤</RNText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ m }: { m: Message }) {
  const mine = m.sender === "customer";
  return (
    <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "84%", gap: 3 }}>
      {!mine ? (
        <RNText style={{ fontFamily: fonts.bold, fontSize: 11.5, color: m.sender === "staff" ? colors.gold : colors.muted, marginLeft: 4 }}>
          {m.sender === "staff" ? "Xtreme team" : "Xtreme assistant · instant answer"}
        </RNText>
      ) : null}
      <View
        style={{
          backgroundColor: mine ? colors.ink : colors.surface,
          borderRadius: 18,
          borderBottomRightRadius: mine ? 6 : 18,
          borderBottomLeftRadius: mine ? 18 : 6,
          paddingHorizontal: space(3.5),
          paddingVertical: space(2.5),
          borderWidth: mine ? 0 : 1,
          borderColor: m.sender === "staff" ? colors.goldLine : colors.border,
          ...shadow.card,
        }}
      >
        <RNText style={{ color: mine ? "#fff" : colors.text, fontFamily: fonts.medium, fontSize: 14.5, lineHeight: 21 }}>{m.body}</RNText>
      </View>
      <RNText style={{ fontSize: 10.5, color: colors.faint, alignSelf: mine ? "flex-end" : "flex-start", marginHorizontal: 4 }}>{time(m.createdAt)}</RNText>
    </View>
  );
}
