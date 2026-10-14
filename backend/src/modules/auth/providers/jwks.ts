import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";

const cache = new Map<string, JWTVerifyGetKey>();

/** Shared, cached JWKS fetcher (jose refreshes keys on rotation by itself). */
export function remoteJwks(url: string): JWTVerifyGetKey {
  let jwks = cache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url), { cooldownDuration: 30_000, cacheMaxAge: 6 * 3_600_000 });
    cache.set(url, jwks);
  }
  return jwks;
}
