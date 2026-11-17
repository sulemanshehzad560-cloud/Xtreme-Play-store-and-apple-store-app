import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ADDRESS, createTestApp, resetDb, signInAs, slot, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.app.close());
beforeEach(resetDb);

describe("booking from an office or staff account", () => {
  it("explains that the number is not a customer account", async () => {
    for (const role of ["admin", "staff"] as const) {
      const who = await signInAs(t, role);
      const res = await t.app.inject({
        method: "POST",
        url: "/v1/bookings",
        headers: who.auth,
        payload: { serviceKey: "regular", propertyType: "apartment", propertySize: "studio", scheduledAt: slot(), address: ADDRESS },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("customer_only");
      expect(res.json().error.message).toContain(role === "admin" ? "office account" : "staff account");
    }
  });
});
