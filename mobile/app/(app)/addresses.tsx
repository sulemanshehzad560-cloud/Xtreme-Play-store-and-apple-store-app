import { useState } from "react";
import { Alert, Pressable, Text as RNText, View } from "react-native";
import { AddressPicker, completeAddress, type NewAddress } from "@/components/AddressPicker";
import { FadeIn } from "@/components/art/Motion";
import { Button, Card, Chip, ErrorText, Row, Screen, StickyFooter, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, fonts, space } from "@/lib/theme";
import { useApi } from "@/lib/useApi";

interface Address extends NewAddress {
  id: string;
  isDefault: boolean;
}

const LABELS = ["Home", "Work", "Parents", "Other"];

export default function Addresses() {
  const { data, reload } = useApi<Address[]>("/me/addresses");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Partial<NewAddress>>({ label: "Home" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const full = completeAddress(draft);
    if (!full) return setError("Choose an area or use your location.");
    setBusy(true);
    setError(null);
    try {
      await api("/me/addresses", { body: full });
      setAdding(false);
      setDraft({ label: "Home" });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const makeDefault = async (id: string) => {
    await api(`/me/addresses/${id}`, { method: "PATCH", body: { isDefault: true } });
    await reload();
  };
  const remove = (a: Address) =>
    Alert.alert("Delete this address?", `${a.label} · ${a.area}`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await api(`/me/addresses/${a.id}`, { method: "DELETE" });
          await reload();
        },
      },
    ]);

  return (
    <Screen
      edges={["left", "right"]}
      footer={
        <StickyFooter>
          {adding ? (
            <>
              <Button title="Cancel" variant="secondary" onPress={() => setAdding(false)} style={{ flex: 1 }} />
              <Button title="Save address" onPress={save} loading={busy} style={{ flex: 1.4 }} />
            </>
          ) : (
            <Button title="+ Add new address" onPress={() => setAdding(true)} style={{ flex: 1 }} />
          )}
        </StickyFooter>
      }
    >
      {adding ? (
        <>
          <Text variant="heading">New address</Text>
          <Row style={{ gap: space(2), flexWrap: "wrap" }}>
            {LABELS.map((l) => (
              <Chip key={l} label={l} selected={draft.label === l} onPress={() => setDraft({ ...draft, label: l })} />
            ))}
          </Row>
          <AddressPicker value={draft} onChange={setDraft} />
          <ErrorText error={error} />
        </>
      ) : (
        <>
          {data?.length === 0 ? <Text variant="muted">No saved addresses yet. Add one to book faster.</Text> : null}
          {data?.map((a, i) => (
            <FadeIn key={a.id} delay={i * 40}>
              <Card>
                <Row style={{ alignItems: "flex-start" }}>
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
                    <RNText style={{ fontSize: 18 }}>{a.label === "Work" ? "🏢" : a.label === "Home" ? "🏠" : "📍"}</RNText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Row style={{ gap: space(2) }}>
                      <Text style={{ fontFamily: fonts.bold }}>{a.label}</Text>
                      {a.isDefault ? (
                        <View style={{ backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <RNText style={{ color: colors.goldBright, fontFamily: fonts.bold, fontSize: 10 }}>DEFAULT</RNText>
                        </View>
                      ) : null}
                    </Row>
                    <Text variant="small">{[a.unit, a.building, a.area].filter(Boolean).join(", ")}</Text>
                  </View>
                </Row>
                <Row style={{ gap: space(4), marginTop: space(1) }}>
                  {!a.isDefault ? (
                    <Pressable onPress={() => makeDefault(a.id)}>
                      <Text style={{ color: colors.gold, fontFamily: fonts.bold, fontSize: 14 }}>Set as default</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => remove(a)}>
                    <Text style={{ color: colors.danger, fontFamily: fonts.bold, fontSize: 14 }}>Delete</Text>
                  </Pressable>
                </Row>
              </Card>
            </FadeIn>
          ))}
        </>
      )}
    </Screen>
  );
}
