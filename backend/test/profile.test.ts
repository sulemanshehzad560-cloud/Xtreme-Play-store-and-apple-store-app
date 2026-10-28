import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetDb, signInAs, signInPhone, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.app.close());
beforeEach(resetDb);

const req = (method: "GET" | "PUT" | "PATCH" | "DELETE", url: string, auth: Record<string, string>, payload?: unknown) =>
  t.app.inject({ method, url, headers: auth, ...(payload ? { payload: payload as object } : {}) });

// A real 1x1 PNG.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const png = () => Buffer.concat([Buffer.from(PNG, "base64"), Buffer.alloc(200)]).toString("base64"); // padded past the minimum size

describe("profile", () => {
  it("saves name and date of birth, and rejects impossible birth dates", async () => {
    const me = await signInPhone(t);
    const set = await req("PATCH", "/v1/me", me.auth, { fullName: "Sara Al Mansoori", dateOfBirth: "1992-04-17" });
    expect(set.json()).toMatchObject({ fullName: "Sara Al Mansoori", dateOfBirth: "1992-04-17" });
    expect((await req("PATCH", "/v1/me", me.auth, { dateOfBirth: "2020-01-01" })).json().error.code).toBe("invalid_date_of_birth");
    expect((await req("PATCH", "/v1/me", me.auth, { dateOfBirth: "17/04/1992" })).statusCode).toBe(400);
  });

  it("uploads, serves and removes a profile photo, privately", async () => {
    const me = await signInPhone(t);
    const other = await signInPhone(t);
    const admin = await signInAs(t, "admin");
    expect((await req("PUT", "/v1/me/avatar", me.auth, { image: Buffer.from("x".repeat(300)).toString("base64") })).json().error.code).toBe("invalid_image");

    const upRes = await req("PUT", "/v1/me/avatar", me.auth, { image: png() });
    const up = upRes.json();
    expect(up.avatarUrl).toMatch(new RegExp(`^https://api\\.xtreme\\.test/v1/avatars/${me.user.id}/\\d+/[0-9a-f]{32}$`));
    const path = new URL(up.avatarUrl).pathname;
    const own = await req("GET", path, me.auth);
    expect(own.statusCode).toBe(200);
    expect(own.headers["content-type"]).toBe("image/png");
    // The signed link works without a token (app images, office dashboard); a forged one does not.
    expect((await t.app.inject({ method: "GET", url: path })).statusCode).toBe(200);
    expect((await t.app.inject({ method: "GET", url: path.replace(/[0-9a-f]{32}$/, "0".repeat(32)) })).statusCode).toBe(404);
    // The token-protected address still works for the owner and staff only.
    const legacy = `/v1/users/${me.user.id}/avatar`;
    expect((await req("GET", legacy, other.auth)).statusCode).toBe(404);
    expect((await req("GET", legacy, admin.auth)).statusCode).toBe(200);

    expect((await req("DELETE", "/v1/me/avatar", me.auth)).json().avatarUrl).toBeNull();
    expect((await req("GET", path, me.auth)).statusCode).toBe(404);
  });
});
