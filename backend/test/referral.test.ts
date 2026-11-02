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
  it("gives the friend AED 20 off their first booking and the inviter AED 20 wallet credit once that clean is done", async () => {
    const sara = await signInPhone(t, undefined, "Sara Al Mansoori");
    const omar = await signInPhone(t, undefined, "Omar Khan");
    const admin = await signInAs(t, "admin");
    const staff = await signInAs(t, "staff");

    const mine = (await inject("GET", "/v1/me/referral", sara.auth)).json();
    expect(mine).toMatchObject({ enabled: true, friendAed: 20, rewardAed: 20, invited: 0, walletAed: 0 });
    expect(mine.code).toMatch(/^SARA[A-Z2-9]{4}$/);
    expect((await inject("GET", "/v1/me/referral", sara.auth)).json().code).toBe(mine.code); // stable

    // Sara can't use her own code.
    const own = await book(t, sara.auth);
    expect((await inject("POST", `/v1/bookings/${own.id}/promo`, sara.auth, { code: mine.code })).json().error.code).toBe("code_not_applicable");

    // Omar's first booking: AED 150 - 20, paid.
    const first = await book(t, omar.auth);
    const applied = await inject("POST", `/v1/bookings/${first.id}/promo`, omar.auth, { code: mine.code.toLowerCase() });
    expect(applied.json()).toMatchObject({ discountAed: 20, promoMessage: "Sara's invite applied" });
    await pay(t, omar.auth, first.id);

    // Paying is not enough: the reward comes when the clean has happened.
    expect((await inject("GET", "/v1/me/referral", sara.auth)).json()).toMatchObject({ invited: 0, walletAed: 0 });
    await inject("POST", `/v1/admin/bookings/${first.id}/assign`, admin.auth, { staffIds: [staff.user.id] });
    for (const status of ["en_route", "arrived", "in_progress", "completed"]) await inject("POST", `/v1/staff/jobs/${first.id}/status`, staff.auth, { status });
    expect((await inject("GET", "/v1/me/referral", sara.auth)).json()).toMatchObject({ invited: 1, walletAed: 20 });
    const inbox = (await inject("GET", "/v1/me/notifications", sara.auth)).json();
    expect(inbox.some((n: { title: string }) => n.title === "AED 20 added to your wallet")).toBe(true);

    // The wallet comes off Sara's next booking automatically; what is used is spent.
    const options = (await inject("GET", `/v1/bookings/${own.id}/payment-options`, sara.auth)).json();
    expect(options.amount).toMatchObject({ priceAed: 150, discountAed: 20, totalAed: 130 });
    await pay(t, sara.auth, own.id);
    expect((await inject("GET", "/v1/me/referral", sara.auth)).json().walletAed).toBe(0);

    // Omar can't use an invite again; personal credits stay out of the office's promotions list.
    const second = await book(t, omar.auth);
    expect((await inject("POST", `/v1/bookings/${second.id}/promo`, omar.auth, { code: mine.code })).json().error.code).toBe("code_not_applicable");
    expect((await inject("GET", "/v1/admin/promotions", admin.auth)).json()).toEqual([]);
  });

  it("keeps wallet credit that a cheaper booking did not use", async () => {
    const sara = await signInPhone(t, undefined, "Sara");
    // Seed a wallet balance bigger than a studio clean can use (AED 90 - min charge 2 = 88).
    const wallet = await t.c.db.execute(
      `insert into promotions (name, kind, value, auto_apply, first_booking_only, owner_id, active) values ('Wallet credit', 'fixed', 100, true, false, '${sara.user.id}', true) returning id` as never,
    );
    expect(wallet).toBeTruthy();
    const studio = await book(t, sara.auth, { propertySize: "studio" });
    expect((await inject("GET", `/v1/bookings/${studio.id}/payment-options`, sara.auth)).json().amount).toMatchObject({ priceAed: 90, discountAed: 88, totalAed: 2 });
    await pay(t, sara.auth, studio.id);
    expect((await inject("GET", "/v1/me/referral", sara.auth)).json().walletAed).toBe(12);
  });

  it("shows real ratings and completed jobs for social proof", async () => {
    const stats = (await t.app.inject({ method: "GET", url: "/v1/catalog/stats" })).json();
    expect(stats).toEqual({ rating: null, reviewCount: 0, completedJobs: 0 });
  });
});

describe("tipping the team", () => {
  it("adds the tip to the payment, keeps it out of VAT, itemises it and tells the team", async () => {
    const me = await signInPhone(t, undefined, "Sara");
    const admin = await signInAs(t, "admin");
    const staff = await signInAs(t, "staff");
    const booking = await book(t, me.auth); // AED 150
    const start = await inject("POST", `/v1/bookings/${booking.id}/payments`, me.auth, { method: "card", tipAed: 10 });
    expect(start.statusCode).toBe(201);
    const intentId = [...t.card.intents.keys()].at(-1)!;
    expect(t.card.intents.get(intentId)!.amountMinor).toBe(16000);
    t.card.succeed(intentId);
    await t.app.inject({ method: "POST", url: "/v1/webhooks/stripe", headers: { "stripe-signature": "good", "content-type": "application/json" }, payload: JSON.stringify({ id: "evt_tip", type: "payment_intent.succeeded", intentId }) });

    const invoice = (await inject("GET", `/v1/bookings/${booking.id}/invoice`, me.auth)).json();
    expect(invoice).toMatchObject({ totalAed: 160, vatAed: 7.14, subtotalAed: 142.86 });
    expect(invoice.lines.at(-1)).toMatchObject({ description: "Tip for your team (passed on in full)", amountAed: 10 });
    // The team hears about it when the job is done.
    await inject("POST", `/v1/admin/bookings/${booking.id}/assign`, admin.auth, { staffIds: [staff.user.id] });
    for (const status of ["en_route", "arrived", "in_progress", "completed"]) await inject("POST", `/v1/staff/jobs/${booking.id}/status`, staff.auth, { status });
    const staffInbox = (await inject("GET", "/v1/me/notifications", staff.auth)).json();
    expect(staffInbox.some((n: { title: string }) => n.title === "You got a AED 10 tip!")).toBe(true);
  });
});
