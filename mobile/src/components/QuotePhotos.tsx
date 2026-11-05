import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Pressable, Text as RNText, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SaveFormat, manipulateAsync } from "expo-image-manipulator";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { colors, fonts, radius, space } from "@/lib/theme";
import { LineIcon } from "./LineIcon";

export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 5;

/** A photo ready to send: resized to 1600 px on the long side, JPEG. */
export interface QuotePhoto {
  uri: string;
  base64: string;
}

export interface SentPhoto {
  id: string;
  url: string;
}

async function prepare(asset: ImagePicker.ImagePickerAsset): Promise<QuotePhoto> {
  const long = Math.max(asset.width || 0, asset.height || 0);
  const resize = long > 1600 ? [{ resize: asset.width >= asset.height ? { width: 1600 } : { height: 1600 } }] : [];
  const out = await manipulateAsync(asset.uri, resize, { compress: 0.82, format: SaveFormat.JPEG, base64: true });
  return { uri: out.uri, base64: out.base64 ?? "" };
}

/** Lets the customer take or choose up to `remaining` good-quality photos. */
export async function pickQuotePhotos(source: "camera" | "library", remaining: number): Promise<QuotePhoto[]> {
  if (remaining <= 0) return [];
  const perm = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      source === "camera" ? t("Camera access is off") : t("Photo access is off"),
      t("You can allow it in your phone's Settings for Xtreme-Cleaning Partner."),
      [{ text: t("Not now") }, { text: t("Open Settings"), onPress: () => void Linking.openSettings() }],
    );
    return [];
  }
  const res =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9, allowsMultipleSelection: true, selectionLimit: remaining, orderedSelection: true });
  if (res.canceled) return [];
  const picked = res.assets.slice(0, remaining);
  return Promise.all(picked.map(prepare));
}

/** Sends the photos for a booking, one at a time. Returns how many were sent. */
export async function uploadQuotePhotos(bookingId: string, photos: QuotePhoto[], onProgress?: (done: number) => void) {
  let done = 0;
  for (const p of photos) {
    await api(`/bookings/${bookingId}/photos`, { body: { image: p.base64 } });
    done += 1;
    onProgress?.(done);
  }
  return done;
}

const TIPS = ["Good light, in focus", "The whole item, then close-ups of stains or damage", "Include labels or size if you can"];

function Thumb({ uri, onRemove, size }: { uri: string; onRemove?: () => void; size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }}>
      <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" accessibilityIgnoresInvertColors />
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("Remove photo")}
          style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}
        >
          <RNText style={{ color: "#fff", fontSize: 14, lineHeight: 16, fontFamily: fonts.bold }}>✕</RNText>
        </Pressable>
      ) : null}
    </View>
  );
}

function AddButtons({ remaining, busy, onPick }: { remaining: number; busy: boolean; onPick: (source: "camera" | "library") => void }) {
  if (remaining <= 0) return null;
  const btn = (source: "camera" | "library", label: string, icon: "camera" | "image") => (
    <Pressable
      onPress={busy ? undefined : () => onPick(source)}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: space(2),
        paddingVertical: space(3),
        borderRadius: radius.md,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: colors.goldLine,
        backgroundColor: pressed ? colors.goldSoft : colors.surface,
      })}
    >
      <LineIcon name={icon} size={20} color={colors.gold} />
      <RNText style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.text }}>{label}</RNText>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", gap: space(2) }}>
      {btn("camera", t("Take photo"), "camera")}
      {btn("library", t("From gallery"), "image")}
    </View>
  );
}

function Header({ count }: { count: number }) {
  const ok = count >= MIN_PHOTOS;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(2) }}>
        <RNText style={{ fontFamily: fonts.extrabold, fontSize: 16, color: colors.text, flex: 1 }}>{t("Photos for your quote")}</RNText>
        <View style={{ backgroundColor: ok ? colors.successSoft : colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: 3 }}>
          <RNText style={{ fontFamily: fonts.bold, fontSize: 12, color: ok ? colors.success : colors.gold }}>{t("{0} of {1}", { 0: count, 1: MAX_PHOTOS })}</RNText>
        </View>
      </View>
      <RNText style={{ fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 19, color: colors.muted }}>
        {t("Send 3 to 5 clear, good-quality photos. Our team reviews them and sends your quote to the app.")}
      </RNText>
    </View>
  );
}

const card = { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.goldLine, padding: space(4), gap: space(3) } as const;

/** Booking flow: photos chosen before the request is sent (kept on the phone until then). */
export function QuotePhotoPicker({ photos, onChange }: { photos: QuotePhoto[]; onChange: (p: QuotePhoto[]) => void }) {
  const [busy, setBusy] = useState(false);
  const remaining = MAX_PHOTOS - photos.length;
  async function pick(source: "camera" | "library") {
    setBusy(true);
    try {
      const more = await pickQuotePhotos(source, remaining);
      if (more.length) onChange([...photos, ...more].slice(0, MAX_PHOTOS));
    } catch {
      Alert.alert(t("Could not add that photo"), t("Please try another photo."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={card}>
      <Header count={photos.length} />
      <View style={{ gap: 4 }}>
        {TIPS.map((tip) => (
          <RNText key={tip} style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.text }}>
            <RNText style={{ color: colors.gold }}>✓ </RNText>
            {t(tip)}
          </RNText>
        ))}
      </View>
      {photos.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
          {photos.map((p, i) => (
            <Thumb key={p.uri} uri={p.uri} size={88} onRemove={() => onChange(photos.filter((_, j) => j !== i))} />
          ))}
        </View>
      ) : null}
      {busy ? <ActivityIndicator color={colors.gold} /> : <AddButtons remaining={remaining} busy={busy} onPick={pick} />}
      {photos.length < MIN_PHOTOS ? (
        <RNText style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: colors.gold }}>
          {t("Add {0} more to continue", { 0: MIN_PHOTOS - photos.length })}
        </RNText>
      ) : null}
    </View>
  );
}

/** Booking page: photos already sent, with "under review" status and the option to add more. */
export function QuotePhotoStatus({ bookingId, quoted, editable }: { bookingId: string; quoted: boolean; editable: boolean }) {
  const [photos, setPhotos] = useState<SentPhoto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<SentPhoto[]>(`/bookings/${bookingId}/photos`)
      .then(setPhotos)
      .catch(() => setPhotos([]));
  }, [bookingId]);
  useEffect(load, [load]);

  if (photos === null) return null;
  if (quoted && photos.length === 0) return null;
  const remaining = MAX_PHOTOS - photos.length;
  const canAdd = editable && !quoted;

  async function add(source: "camera" | "library") {
    setBusy(true);
    try {
      const more = await pickQuotePhotos(source, remaining);
      if (more.length) await uploadQuotePhotos(bookingId, more);
      load();
    } catch (e) {
      Alert.alert(t("Could not send the photo"), e instanceof Error ? e.message : t("Please try again."));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    try {
      setPhotos(await api<SentPhoto[]>(`/bookings/${bookingId}/photos/${id}`, { method: "DELETE" }));
    } catch (e) {
      Alert.alert(t("Could not remove the photo"), e instanceof Error ? e.message : t("Please try again."));
    }
  }

  const reviewing = !quoted && photos.length >= MIN_PHOTOS;
  return (
    <View style={card}>
      <Header count={photos.length} />
      {reviewing ? (
        <View style={{ flexDirection: "row", gap: space(2), alignItems: "center", backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: space(3) }}>
          <LineIcon name="clock" size={20} color={colors.gold} />
          <RNText style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 13.5, lineHeight: 19, color: colors.text }}>
            {t("Our team is reviewing your photos. You'll get a notification as soon as your quote is ready.")}
          </RNText>
        </View>
      ) : null}
      {photos.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
          {photos.map((p) => (
            <Thumb key={p.id} uri={p.url} size={88} onRemove={canAdd ? () => void remove(p.id) : undefined} />
          ))}
        </View>
      ) : null}
      {canAdd ? busy ? <ActivityIndicator color={colors.gold} /> : <AddButtons remaining={remaining} busy={busy} onPick={(s) => void add(s)} /> : null}
      {canAdd && photos.length < MIN_PHOTOS ? (
        <RNText style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: colors.gold }}>
          {t("Add {0} more so we can prepare your quote", { 0: MIN_PHOTOS - photos.length })}
        </RNText>
      ) : null}
    </View>
  );
}
