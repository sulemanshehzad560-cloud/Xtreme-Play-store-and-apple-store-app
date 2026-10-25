// Adds an iOS internal tester: invites the email to App Store Connect (Apple emails the
// invite), and once the invite is accepted, adds them to the internal TestFlight group so
// Apple emails the TestFlight link. Safe to run again: each step is skipped when done.
import { createPrivateKey, sign } from "node:crypto";

const APP_ID = "6826784890";
const GROUP = process.env.GROUP || "Team (Expo)";
const email = (process.env.TESTER_EMAIL ?? "").trim().toLowerCase();
const firstName = (process.env.FIRST_NAME ?? "").trim() || "Tester";
const lastName = (process.env.LAST_NAME ?? "").trim() || "Xtreme";
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.log(`::error::"${email}" is not an email address`);
  process.exit(1);
}

const body = (process.env.ASC_API_KEY_P8 ?? "").replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
const key = createPrivateKey(`-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: "ES256", kid: process.env.ASC_KEY_ID.trim(), typ: "JWT" })}.${b64({ iss: process.env.ASC_ISSUER_ID.trim(), iat: now, exp: now + 1200, aud: "appstoreconnect-v1" })}`;
const jwt = `${unsigned}.${sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;

async function asc(method, path, payload) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = (json.errors ?? []).map((e) => `${e.code}: ${e.detail ?? e.title}`).join("; ");
    const err = new Error(`${method} ${path} → ${res.status} ${detail}`);
    err.status = res.status;
    throw err;
  }
  return json;
}
const q = encodeURIComponent;

// 1. Is the person already a team member, or already invited?
const users = await asc("GET", `/v1/users?filter[username]=${q(email)}&limit=1`);
const isUser = users.data.length > 0;
if (!isUser) {
  const invites = await asc("GET", `/v1/userInvitations?filter[email]=${q(email)}&limit=1`);
  if (invites.data.length) {
    console.log(`Already invited to App Store Connect on ${invites.data[0].attributes.expirationDate ? "an open invite (expires " + invites.data[0].attributes.expirationDate + ")" : "an open invite"}. They must accept it first.`);
  } else {
    await asc("POST", "/v1/userInvitations", {
      data: {
        type: "userInvitations",
        attributes: { email, firstName, lastName, roles: ["MARKETING"], allAppsVisible: false, provisioningAllowed: false },
        relationships: { visibleApps: { data: [{ type: "apps", id: APP_ID }] } },
      },
    });
    console.log(`Invited ${email} to App Store Connect (role: Marketing, this app only). Apple has emailed the invitation.`);
  }
}

// 2. Internal TestFlight group (created by Expo; create it if missing).
const groups = await asc("GET", `/v1/apps/${APP_ID}/betaGroups?limit=50`);
let group = groups.data.find((g) => g.attributes.isInternalGroup && g.attributes.name === GROUP) ?? groups.data.find((g) => g.attributes.isInternalGroup);
if (!group) {
  group = (await asc("POST", "/v1/betaGroups", {
    data: { type: "betaGroups", attributes: { name: GROUP, isInternalGroup: true, hasAccessToAllBuilds: true }, relationships: { app: { data: { type: "apps", id: APP_ID } } } },
  })).data;
  console.log(`Created internal TestFlight group "${group.attributes.name}".`);
}

// 3. Add as tester (only possible once they are a team member).
if (!isUser) {
  console.log(`\nNext: once ${email} accepts the App Store Connect invitation, run this job again and they will be added to "${group.attributes.name}" and get the TestFlight email.`);
  process.exit(0);
}
const existing = await asc("GET", `/v1/betaTesters?filter[email]=${q(email)}&filter[apps]=${APP_ID}&limit=1`);
let testerId;
if (existing.data.length) {
  testerId = existing.data[0].id;
  await asc("POST", `/v1/betaGroups/${group.id}/relationships/betaTesters`, { data: [{ type: "betaTesters", id: testerId }] }).catch((e) => {
    if (e.status !== 409) throw e;
  });
  console.log(`${email} is a tester in "${group.attributes.name}".`);
} else {
  testerId = (await asc("POST", "/v1/betaTesters", {
    data: { type: "betaTesters", attributes: { email, firstName, lastName }, relationships: { betaGroups: { data: [{ type: "betaGroups", id: group.id }] } } },
  })).data.id;
  console.log(`Added ${email} to "${group.attributes.name}".`);
}

// 4. Make sure the newest usable build is in the group, so it shows in the TestFlight app.
const builds = await asc("GET", `/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=5`);
for (const b of builds.data) console.log(`Build ${b.attributes.version}: ${b.attributes.processingState}${b.attributes.expired ? " (expired)" : ""}`);
const latest = builds.data.find((b) => b.attributes.processingState === "VALID" && !b.attributes.expired);
if (!latest) {
  console.log("::warning::No processed build yet; the tester will see the app once Apple finishes processing.");
  process.exit(0);
}
await asc("POST", `/v1/betaGroups/${group.id}/relationships/builds`, { data: [{ type: "builds", id: latest.id }] }).catch((e) => {
  if (e.status !== 409) throw e;
});
console.log(`Build ${latest.attributes.version} is available to "${group.attributes.name}".`);
const detail = await asc("GET", `/v1/builds/${latest.id}/buildBetaDetail`).catch(() => null);
if (detail) console.log(`Internal testing state: ${detail.data.attributes.internalBuildState}`);

// 5. (Re)send the TestFlight email.
await asc("POST", "/v1/betaTesterInvitations", {
  data: { type: "betaTesterInvitations", relationships: { betaTester: { data: { type: "betaTesters", id: testerId } }, app: { data: { type: "apps", id: APP_ID } } } },
}).then(
  () => console.log(`Apple has emailed the TestFlight invitation to ${email}.`),
  (e) => console.log(`::warning::Could not send the TestFlight email: ${e.message}`),
);
