import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { book, createTestApp, resetDb, signInAs, signInPhone, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.app.close());
beforeEach(() => resetDb());

const req = (method: "GET" | "POST" | "DELETE", url: string, auth: Record<string, string> = {}, payload?: unknown) =>
  t.app.inject({ method, url, headers: auth, ...(payload ? { payload: payload as object } : {}) });

/** A small valid JPEG-looking payload (JPEG magic bytes + padding). */
const jpeg = (fill = 1) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4000, fill)]).toString("base64");

describe("quote photos", () => {
  it("lets the customer send 3–5 photos, tells the office, and the office quotes from the dashboard", async () => {
    const customer = await signInPhone(t);
    const admin = await signInAs(t, "admin");
    const booking = await book(t, customer.auth, { serviceKey: "sofa" });
    expect(booking.priceAed).toBeNull();
    expect((booking as { photoCount?: number }).photoCount).toBe(0);

    for (let i = 1; i <= 5; i++) {
      const res = await req("POST", `/v1/bookings/${booking.id}/photos`, customer.auth, { image: jpeg(i) });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toHaveLength(i);
    }
    // A sixth is refused.
    expect((await req("POST", `/v1/bookings/${booking.id}/photos`, customer.auth, { image: jpeg(9) })).json().error.code).toBe("too_many_photos");

    // The office is told once three photos are in.
    const adminInbox = (await req("GET", "/v1/me/notifications", admin.auth)).json();
    expect(adminInbox.filter((n: { title: string }) => n.title.startsWith("Photos ready to quote")).length).toBe(1);

    // The office sees them by signed link; a wrong signature is refused.
    const photos = (await req("GET", `/v1/bookings/${booking.id}/photos`, admin.auth)).json();
    expect(photos).toHaveLength(5);
    const path = new URL(photos[0].url).pathname;
    const img = await req("GET", path);
    expect(img.statusCode).toBe(200);
    expect(img.headers["content-type"]).toBe("image/jpeg");
    expect((await req("GET", path.replace(/[0-9a-f]{32}$/, "0".repeat(32)))).statusCode).toBe(404);
    expect((await req("GET", `/v1/bookings/${booking.id}`, admin.auth)).json().photoCount).toBe(5);

    // The customer can remove one before the quote…
    const after = await req("DELETE", `/v1/bookings/${booking.id}/photos/${photos[4].id}`, customer.auth);
    expect(after.json()).toHaveLength(4);

    // …the office prices it and the customer is told.
    await req("POST", `/v1/admin/bookings/${booking.id}/price`, admin.auth, { priceAed: 220, note: "3-seater, fabric" });
    const inbox = (await req("GET", "/v1/me/notifications", customer.auth)).json();
    expect(inbox[0].title).toBe(`Your quote for ${booking.reference}`);
    // After the quote, the photos are fixed.
    expect((await req("DELETE", `/v1/bookings/${booking.id}/photos/${photos[0].id}`, customer.auth)).json().error.code).toBe("already_quoted");
  });

  it("keeps photos private and only for quote jobs", async () => {
    const customer = await signInPhone(t);
    const other = await signInPhone(t, "+971501112299");
    const sofa = await book(t, customer.auth, { serviceKey: "sofa" });
    // Other customers cannot add or see them.
    expect((await req("POST", `/v1/bookings/${sofa.id}/photos`, other.auth, { image: jpeg() })).statusCode).toBe(404);
    expect((await req("GET", `/v1/bookings/${sofa.id}/photos`, other.auth)).statusCode).toBe(404);
    // Not an image.
    const bad = await req("POST", `/v1/bookings/${sofa.id}/photos`, customer.auth, { image: Buffer.alloc(4000, 65).toString("base64") });
    expect(bad.json().error.code).toBe("invalid_image");
    // Fixed-price jobs don't take quote photos.
    const regular = await book(t, customer.auth, { serviceKey: "regular" });
    expect((await req("POST", `/v1/bookings/${regular.id}/photos`, customer.auth, { image: jpeg() })).json().error.code).toBe("not_quote");
  });
});
