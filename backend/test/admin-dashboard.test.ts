import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.app.close());

describe("dispatch dashboard", () => {
  it("is served at /admin/ with its script", async () => {
    const page = await t.app.inject({ method: "GET", url: "/admin/" });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("Xtreme Dispatch");
    const js = await t.app.inject({ method: "GET", url: "/admin/app.js" });
    expect(js.statusCode).toBe(200);
    expect((await t.app.inject({ method: "GET", url: "/admin" })).headers.location).toBe("/admin/");
  });
});
