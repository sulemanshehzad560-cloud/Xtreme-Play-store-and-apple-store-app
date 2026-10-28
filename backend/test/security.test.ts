import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { createTestApp, resetDb, signInAs, signInPhone, type TestContext } from "./helpers.js";
import { TEST_DATABASE_URL } from "./global-setup.js";
import { configureSealing } from "../src/lib/sealed.js";

const KEY = Buffer.alloc(32, 7).toString("base64");
let t: TestContext;
beforeAll(async () => {
  t = await createTestApp({ DATA_ENCRYPTION_KEY: KEY });
});
afterAll(async () => {
  configureSealing(undefined); // other test files run without field encryption
  await t.app.close();
});
beforeEach(resetDb);

async function raw<T>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

describe("encryption at rest", () => {
  it("stores chat messages and profile photos encrypted, and serves them decrypted", async () => {
    const me = await signInPhone(t, undefined, "Sara");
    const admin = await signInAs(t, "admin");
    await t.app.inject({ method: "POST", url: "/v1/me/support/messages", headers: me.auth, payload: { body: "My door code is 4321" } });
    await t.app.inject({ method: "POST", url: `/v1/admin/support/threads/${me.user.id}`, headers: admin.auth, payload: { body: "Thanks, noted" } });

    const rows = await raw<{ sender: string; body: string }>("select sender, body from support_messages where customer_id = $1", [me.user.id]);
    for (const r of rows.filter((x) => x.sender !== "bot")) {
      expect(r.body.startsWith("enc:v1:")).toBe(true);
      expect(r.body).not.toContain("4321");
    }
    const thread = (await t.app.inject({ method: "GET", url: "/v1/me/support/messages", headers: me.auth })).json();
    const bodies = (thread.messages ?? thread).map((m: { body: string }) => m.body);
    expect(bodies).toContain("My door code is 4321");
    expect(bodies).toContain("Thanks, noted");

    const png = Buffer.concat([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"), Buffer.alloc(200)]);
    const up = (await t.app.inject({ method: "PUT", url: "/v1/me/avatar", headers: me.auth, payload: { image: png.toString("base64") } })).json();
    const [avatar] = await raw<{ data: string }>("select data from user_avatars where user_id = $1", [me.user.id]);
    expect(avatar!.data.startsWith("enc:v1:")).toBe(true);
    const served = await t.app.inject({ method: "GET", url: new URL(up.avatarUrl).pathname });
    expect(served.rawPayload.equals(png)).toBe(true);
  });
});
