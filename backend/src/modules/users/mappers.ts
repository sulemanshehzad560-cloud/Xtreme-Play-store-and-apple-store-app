import type { User } from "../../db/schema.js";

export function toPublicUser(user: User, providers: string[] = []) {
  return {
    id: user.id,
    role: user.role,
    fullName: user.fullName,
    phone: user.phone,
    phoneVerified: Boolean(user.phoneVerifiedAt),
    email: user.email,
    avatarUrl: user.avatarUrl,
    locale: user.locale,
    marketingOptIn: user.marketingOptIn,
    signInMethods: providers,
    createdAt: user.createdAt.toISOString(),
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
