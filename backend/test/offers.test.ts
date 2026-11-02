import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bookPaid, createTestApp, resetDb, signInAs, signInPhone, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.app.close());
beforeEach(resetDb);

const send = (method: "POST" | "PATCH", url: string, auth: Record<string, string>, payload: object = {}) => t.app.inject({ method, url, headers: auth, payload });
const inbox = async (auth: Record<string, string>) => (await t.app.inject({ method: "GET", url: "/v1/me/notifications", headers: auth })).json() as { title: string; body: string }[];

async function customer(opts: { locale?: "en" | "ar"; optIn?: boolean; token: string }) {
  const me = await signInPhone(t);
  await send("PATCH", "/v1/me", me.auth, { locale: opts.locale ?? "en", marketingOptIn: opts.optIn ?? false });
  await send("POST", "/v1/me/push-tokens", me.auth, { token: opts.token, platform: "android" });
  return me;
}

const EID = { name: "Eid offer: 20% off", code: "EID20", kind: "percent", value: 20, autoApply: false, firstBookingOnly: false, maxDiscountAed: 100, active: true };

describe("offer announcements", () => {
  it("tells every customer in their language, pushes only to those who opted in, once", async () => {
    const admin = await signInAs(t, "admin");
    const optedIn = await customer({ optIn: true, token: "ExponentPushToken[aaaaaaaaaa]" });
    const arabic = await customer({ locale: "ar", token: "ExponentPushToken[bbbbbbbbbb]" });
    t.push.sent.length = 0;

    const res = await send("POST", "/v1/admin/promotions", admin.auth, { ...EID, endsAt: "2099-04-12T20:00:00Z" });
    expect(res.statusCode).toBe(201);
    await t.c.promotions.announceDue();

    const en = await inbox(optedIn.auth);
    expect(en[0]).toMatchObject({ title: "🎉 Eid offer: 20% off" });
    expect(en[0]!.body).toMatch(/20% off \(up to AED 100\) your booking · use code EID20 · until 13 Apr/);
    const ar = await inbox(arabic.auth);
    expect(ar[0]!.title).toBe("🎉 عرض جديد من Xtreme");
    expect(ar[0]!.body).toMatch(/خصم 20%.*EID20/);
    // Marketing push only for the customer who turned offers on; everyone gets the in-app message.
    expect(t.push.sent.map((m) => m.to)).toEqual(["ExponentPushToken[aaaaaaaaaa]"]);

    expect(await t.c.promotions.announceDue()).toBe(0);
    expect(await inbox(optedIn.auth)).toHaveLength(1);

    // The dashboard can send it again on purpose.
    const again = await send("POST", `/v1/admin/promotions/${res.json().id}/announce`, admin.auth);
    expect(again.json().sent).toBeGreaterThanOrEqual(2);
    expect(await inbox(optedIn.auth)).toHaveLength(2);
  });

  it("announces scheduled seasonal offers when they start, with the office's own message", async () => {
    const admin = await signInAs(t, "admin");
    const me = await customer({ token: "ExponentPushToken[cccccccccc]" });
    const startsAt = new Date(Date.now() + 86_400_000).toISOString();
    const promo = (await send("POST", "/v1/admin/promotions", admin.auth, { ...EID, name: "National Day", code: "UAE54", startsAt, message: "Happy National Day! 54 AED off with UAE54." })).json();
    expect(await t.c.promotions.announceDue()).toBe(0);
    expect(await inbox(me.auth)).toHaveLength(0);

    await send("PATCH", `/v1/admin/promotions/${promo.id}`, admin.auth, { startsAt: new Date(Date.now() - 60_000).toISOString() });
    await t.c.promotions.announceDue();
    expect((await inbox(me.auth))[0]).toMatchObject({ title: "🎉 National Day", body: "Happy National Day! 54 AED off with UAE54." });
  });

  it("only tells customers without a paid booking about first-booking offers, and can be switched off", async () => {
    const admin = await signInAs(t, "admin");
    const newbie = await customer({ token: "ExponentPushToken[dddddddddd]" });
    const regular = await customer({ token: "ExponentPushToken[eeeeeeeeee]" });
    await bookPaid(t, regular.auth);

    await send("POST", "/v1/admin/promotions", admin.auth, { name: "Welcome 15%", kind: "percent", value: 15, autoApply: true, firstBookingOnly: true, active: true });
    await t.c.promotions.announceDue();
    expect((await inbox(newbie.auth)).some((n) => n.title === "🎉 Welcome 15%")).toBe(true);
    expect((await inbox(regular.auth)).some((n) => n.title === "🎉 Welcome 15%")).toBe(false);

    await send("POST", "/v1/admin/promotions", admin.auth, { ...EID, code: "QUIET", notifyCustomers: false });
    await t.c.promotions.announceDue();
    expect((await inbox(newbie.auth)).filter((n) => n.title.startsWith("🎉"))).toHaveLength(1);
  });
});
