import { Alert, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SaveFormat, manipulateAsync } from "expo-image-manipulator";
import { api } from "./api";
import { DEMO } from "./demo";
import type { User } from "./types";

/**
 * Lets the customer take or choose a profile photo, crops it square, shrinks it to 512 px
 * and uploads it. Returns the updated profile, or null if they cancelled.
 */
export async function pickAndUploadAvatar(source: "camera" | "library"): Promise<User | null> {
  const perm = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      source === "camera" ? "Camera access is off" : "Photo access is off",
      "You can allow it in your phone's Settings for Xtreme-Cleaning Partner.",
      [{ text: "Not now" }, { text: "Open Settings", onPress: () => void Linking.openSettings() }],
    );
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.9 };
  const res = source === "camera" ? await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front }) : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled || !res.assets[0]) return null;
  const small = await manipulateAsync(res.assets[0].uri, [{ resize: { width: 512, height: 512 } }], { compress: 0.8, format: SaveFormat.JPEG, base64: true });
  if (DEMO) return api<User>("/me", { method: "PATCH", body: { avatarUrl: small.uri } });
  return api<User>("/me/avatar", { method: "PUT", body: { image: small.base64 } });
}

export const removeAvatar = () => api<User>("/me/avatar", { method: "DELETE" });
