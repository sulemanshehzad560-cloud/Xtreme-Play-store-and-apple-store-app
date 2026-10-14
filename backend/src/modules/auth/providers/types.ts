export type SocialProvider = "google" | "facebook" | "apple";

/** What a provider tells us after its token checks out. */
export interface SocialProfile {
  provider: SocialProvider;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

export interface SocialVerifier {
  readonly provider: SocialProvider;
  readonly configured: boolean;
  verify(token: string, options?: { nonce?: string | undefined }): Promise<SocialProfile>;
}
