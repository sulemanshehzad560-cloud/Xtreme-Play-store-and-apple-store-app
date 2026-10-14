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

describe("legal pages", () => {
  it("serves the privacy policy and the account deletion link", async () => {
    const page = await t.app.inject({ method: "GET", url: "/privacy" });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.body).toMatch(/^<!doctype html>/);
    expect(page.body).toContain('id="delete-account"');
    const del = await t.app.inject({ method: "GET", url: "/delete-account" });
    expect(del.headers.location).toBe("/privacy#delete-account");
  });
});
