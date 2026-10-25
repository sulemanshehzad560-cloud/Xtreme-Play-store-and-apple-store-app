// Checks the App Store Connect API key secrets against Apple and explains what is wrong,
// without printing any secret value.
import { createPrivateKey, sign } from "node:crypto";

const p8 = process.env.ASC_API_KEY_P8 ?? "";
const keyId = (process.env.ASC_KEY_ID ?? "").trim();
const issuer = (process.env.ASC_ISSUER_ID ?? "").trim();
const problems = [];
if (!/^[A-Z0-9]{10}$/.test(keyId)) problems.push(`ASC_KEY_ID should be 10 capital letters/digits (it has ${keyId.length} characters${/-/.test(keyId) ? " and dashes: this looks like the Issuer ID" : ""})`);
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issuer)) problems.push(`ASC_ISSUER_ID should look like 69a6de7e-xxxx-xxxx-xxxx-xxxxxxxxxxxx (it has ${issuer.length} characters${/^[A-Z0-9]{10}$/.test(issuer) ? ": this looks like the Key ID" : ""})`);
const body = p8.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
let key;
try {
  key = createPrivateKey(`-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----\n`);
} catch {
  problems.push("ASC_API_KEY_P8 is not a readable private key: paste the whole .p8 text again");
}
if (problems.length) {
  problems.forEach((p) => console.log(`::error::${p}`));
  process.exit(1);
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: "ES256", kid: keyId, typ: "JWT" })}.${b64({ iss: issuer, iat: now, exp: now + 600, aud: "appstoreconnect-v1" })}`;
const jwt = `${unsigned}.${sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
const res = await fetch("https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=ae.xtremefm.app", { headers: { Authorization: `Bearer ${jwt}` } });
if (res.status === 401) {
  console.log("::error::Apple rejected the key (401). Usual causes: the Key ID and Issuer ID belong to different keys, the key was revoked, or it is an Individual key (use a Team key). Create a new Team key with Admin access and update all three secrets.");
  process.exit(1);
}
if (res.status === 403) {
  console.log("::error::Apple accepted the key but it lacks permission (403). Create a Team key with Admin access.");
  process.exit(1);
}
const data = await res.json();
console.log(`Apple accepted the key (HTTP ${res.status}); apps found for ae.xtremefm.app: ${data.data?.length ?? 0}`);
// Mirror the normalised key for EAS in case the secret lost its line breaks.
if (process.env.KEY_OUT) (await import("node:fs")).writeFileSync(process.env.KEY_OUT, key.export({ type: "pkcs8", format: "pem" }));
