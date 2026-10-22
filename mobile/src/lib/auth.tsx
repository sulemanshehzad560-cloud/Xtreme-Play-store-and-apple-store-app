import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import { AccessToken, AuthenticationToken, LoginManager } from "react-native-fbsdk-next";
import { api, getSession, onSessionChange, restoreSession, setSession } from "./api";
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from "./config";
import { DEMO } from "./demo";
import { unregisterPush } from "./push";
import type { Session, User } from "./types";

if (!DEMO) GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID });

interface AuthState {
  ready: boolean;
  user: User | null;
  requestCode(phone: string): Promise<{ phone: string; resendIn: number }>;
  verifyCode(phone: string, code: string, fullName?: string): Promise<Session>;
  signInStaff(staffId: string, password: string): Promise<Session>;
  signInWithGoogle(): Promise<Session | null>;
  signInWithApple(): Promise<Session | null>;
  signInWithFacebook(): Promise<Session | null>;
  refreshUser(): Promise<void>;
  signOut(): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

async function start(path: string, body: unknown): Promise<Session> {
  const session = await api<Session>(path, { body });
  await setSession(session);
  return session;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const off = onSessionChange((s) => setUser(s?.user ?? null));
    restoreSession()
      .then(async (s) => {
        setUser(s?.user ?? null);
        if (s) {
          // Pick up role or profile changes made while the app was closed.
          const fresh = await api<User>("/me").catch(() => null);
          if (fresh && getSession()) await setSession({ ...getSession()!, user: fresh });
        }
      })
      .finally(() => setReady(true));
    return () => {
      off();
    };
  }, []);

  const value: AuthState = {
    ready,
    user,
    requestCode: (phone) => api("/auth/otp/request", { body: { phone } }),
    verifyCode: (phone, code, fullName) => start("/auth/otp/verify", { phone, code, fullName }),
    signInStaff: (staffId, password) => start("/auth/staff/login", { staffId, password }),

    async signInWithGoogle() {
      if (DEMO) return start("/auth/google", { idToken: "demo" });
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await GoogleSignin.signIn();
      if (!isSuccessResponse(res) || !res.data.idToken) return null;
      return start("/auth/google", { idToken: res.data.idToken });
    },

    async signInWithApple() {
      if (DEMO) return start("/auth/apple", { identityToken: "demo" });
      const nonce = Crypto.randomUUID();
      const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashed,
      });
      if (!cred.identityToken) return null;
      const fullName = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(" ") || undefined;
      return start("/auth/apple", { identityToken: cred.identityToken, nonce, fullName });
    },

    async signInWithFacebook() {
      if (DEMO) return start("/auth/facebook", { accessToken: "demo" });
      // iOS uses Limited Login (no tracking prompt needed); Android uses classic login.
      if (Platform.OS === "ios") {
        const nonce = Crypto.randomUUID();
        const result = await LoginManager.logInWithPermissions(["public_profile", "email"], "limited", nonce);
        if (result.isCancelled) return null;
        const token = await AuthenticationToken.getAuthenticationTokenIOS();
        if (!token) return null;
        return start("/auth/facebook", { accessToken: token.authenticationToken, nonce });
      }
      const result = await LoginManager.logInWithPermissions(["public_profile", "email"]);
      if (result.isCancelled) return null;
      const token = await AccessToken.getCurrentAccessToken();
      if (!token) return null;
      return start("/auth/facebook", { accessToken: token.accessToken });
    },

    async refreshUser() {
      const fresh = await api<User>("/me");
      if (getSession()) await setSession({ ...getSession()!, user: fresh });
    },

    async signOut() {
      const s = getSession();
      await unregisterPush().catch(() => undefined);
      if (s) await api("/auth/logout", { body: { refreshToken: s.refreshToken } }).catch(() => undefined);
      if (!DEMO) {
        await GoogleSignin.signOut().catch(() => undefined);
        LoginManager.logOut();
      }
      await setSession(null);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
