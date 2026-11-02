import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { book, createTestApp, pay, resetDb, signInAs, signInPhone, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await resetDb();
  await t.c.prices.load();
  await t.app.close();
});
beforeEach(async () => {
  await resetDb();
  await t.c.prices.load();
});

const inject = (method: "GET" | "POST", url: string, auth: Record<string, string>, payload?: object) =>
  t.app.inject({ method, url, headers: auth, ...(payload ? { payload } : {}) });

describe("refer a friend", () => {
  it("gives the friend AED 25 off their first booking and the inviter an automatic AED 25 credit", async () => {
    const sara = await signInPhone(t, undefined, "Sara Al Mansoori");
    const omar = await signInPhone(t, undefined, "Omar Khan");

    const mine = (await inject("GET", "/v1/me/referral", sara.auth)).json();
    expect(mine).toMatchObject({ enabled: true, friendAed: 25, rewardAed: 25, invited: 0, rewardsAvailable: [] });
    expect(mine.code).toMatch(/^SARA[A-Z2-9]{4}$/);
    expect((await inject("GET", "/v1/me/referral", sara.auth)).json().code).toBe(mine.code); // stable

    // Sara can't use her own code.
    const own = await book(t, sara.auth);
    expect((await inject("POST", `/v1/bookings/${own.id}/promo`, sara.auth, { code: mine.code })).json().error.code).toBe("code_not_applicable");

    // Omar's first booking: AED 150 - 25.
    const first = await book(t, omar.auth);
    const applied = await inject("POST", `/v1/bookings/${first.id}/promo`, omar.auth, { code: mine.code.toLowerCase() });
    expect(applied.statusCode).toBe(200);
    expect(applied.json()).toMatchObject({ discountAed: 25, promoMessage: "Sara's invite applied" });
    await pay(t, omar.auth, first.id);

    // Sara gets her reward and it applies to her next booking by itself.
    const after = (await inject("GET", "/v1/me/referral", sara.auth)).json();
    expect(after.invited).toBe(1);
    expect(after.rewardsAvailable).toEqual([expect.objectContaining({ name: "Thanks for inviting Omar", valueAed: 25 })]);
    const inbox = (await inject("GET", "/v1/me/notifications", sara.auth)).json();
    expect(inbox.some((n: { title: string }) => n.title === "You earned AED 25!")).toBe(true);
    const next = await book(t, sara.auth);
    const options = (await inject("GET", `/v1/bookings/${next.id}/payment-options`, sara.auth)).json();
    expect(options.amount).toMatchObject({ priceAed: 150, discountAed: 25, totalAed: 125 });
    await pay(t, sara.auth, next.id);
    expect((await inject("GET", "/v1/me/referral", sara.auth)).json().rewardsAvailable).toEqual([]); // used once

    // Omar can't use an invite again, and no one else can use Sara's personal reward.
    const second = await book(t, omar.auth);
    expect((await inject("POST", `/v1/bookings/${second.id}/promo`, omar.auth, { code: mine.code })).json().error.code).toBe("code_not_applicable");

    // Personal rewards stay out of the office's promotions list.
    const admin = await signInAs(t, "admin");
    expect((await inject("GET", "/v1/admin/promotions", admin.auth)).json()).toEqual([]);
  });

  it("shows real ratings and completed jobs for social proof", async () => {
    const stats = (await t.app.inject({ method: "GET", url: "/v1/catalog/stats" })).json();
    expect(stats).toEqual({ rating: null, reviewCount: 0, completedJobs: 0 });
  });
});
