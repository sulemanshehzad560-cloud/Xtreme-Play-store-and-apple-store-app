import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetDb, signInAs, signInPhone, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.app.close());
beforeEach(resetDb);

describe("free-materials message", () => {
  it("has a default, is editable by the office (English and Arabic) and reaches the app", async () => {
    const company = async () => (await t.app.inject({ method: "GET", url: "/v1/company" })).json();
    expect((await company()).materials).toEqual({
      title: "Cleaning materials are free of cost",
      note: "Professional-grade cleaning solutions",
      titleAr: "مواد التنظيف مجانية",
      noteAr: "منتجات تنظيف احترافية",
    });

    const admin = await signInAs(t, "admin");
    const res = await t.app.inject({
      method: "PUT",
      url: "/v1/admin/settings/company",
      headers: admin.auth,
      payload: { materialsNote: "Eco-friendly, professional-grade products", materialsNoteAr: "منتجات احترافية صديقة للبيئة" },
    });
    expect(res.statusCode).toBe(200);
    expect((await company()).materials).toMatchObject({ title: "Cleaning materials are free of cost", note: "Eco-friendly, professional-grade products", noteAr: "منتجات احترافية صديقة للبيئة" });

    const customer = await signInPhone(t);
    expect((await t.app.inject({ method: "PUT", url: "/v1/admin/settings/company", headers: customer.auth, payload: { materialsNote: "x" } })).statusCode).toBe(403);
  });
});
